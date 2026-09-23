import { roundToCents } from '@/lib/pay/money';
import type { SpendCategory } from './types';

/**
 * Revolut CSV import.
 *
 * Hardcoded to one export format, deliberately. CLAUDE.md's "no bank
 * integration" was overturned on 2026-09-21 only this far: the user's own
 * downloaded statement, parsed locally. No OCR, no PDFs, no open banking, no
 * aggregator — those stay out permanently.
 *
 * Revolut's export looks like:
 *   Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
 *   CARD_PAYMENT,Current,2026-09-18 19:22:01,2026-09-19 08:14:02,Tesco,-32.50,0.00,EUR,COMPLETED,412.18
 *
 * Amount is already signed the way this app wants it: negative out, positive
 * in. Fee is separate and also a real cost, so it is added to the magnitude
 * rather than dropped.
 */

export interface ParsedTxn {
  posted_on: string;
  description: string;
  /** The NATIVE amount. Not converted — see the note on currency below. */
  amount_cents: number;
  /** ISO 4217, as the statement gave it. */
  currency: string;
  category: SpendCategory;
  external_id: string;
}

export interface ParseResult {
  rows: ParsedTxn[];
  /** Lines that could not be read, with why. Never silently dropped. */
  skipped: { line: number; reason: string }[];
  /** Rows present but not yet completed — excluded, because they may vanish. */
  pending: number;
  /** Non-EUR rows captured, by currency. Stored, but not yet summed. */
  foreign: Record<string, number>;
}

/**
 * Currency.
 *
 * Non-EUR rows used to be skipped. Safe, but it meant that from January, in
 * Montreal, every local transaction would be absent and the budget would go
 * blind exactly when it mattered. Data not captured is unrecoverable; a sum
 * that has to wait is merely late.
 *
 * So the native amount and its currency are both stored, and nothing is
 * converted. Totals remain euro-only and the UI says how many rows were left
 * out. FX conversion is a separate decision with its own rate-and-date
 * discipline, and inventing one here would be the same failure as inventing
 * a pay rule.
 */
const DEFAULT_CURRENCY = 'EUR';

/** A CSV line split on commas, respecting double quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      out.push(field);
      field = '';
    } else {
      field += char;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/**
 * A first guess at the category, from the description.
 *
 * Deliberately crude and deliberately conservative: anything it is not
 * reasonably sure about lands in 'other' for the user or the model to fix.
 * Guessing confidently and wrongly is worse than not guessing, because a
 * wrong category silently distorts every spending total built on it.
 */
const HINTS: [RegExp, SpendCategory][] = [
  [/tesco|lidl|aldi|dunnes|spar|centra|supervalu|grocer/i, 'groceries'],
  [/restaurant|cafe|coffee|starbucks|costa|deliveroo|just ?eat|mcdonald|takeaway|bar |pub/i, 'eating_out'],
  [/leap|irish rail|dublin bus|luas|uber|bolt|freenow|taxi|aircoach|bus ?eireann/i, 'transport'],
  [/rent|landlord|accommodation/i, 'rent'],
  [/electric|gas|bord gais|sse |virgin|eir|vodafone|three|broadband|utility/i, 'bills'],
  [/pharmacy|boots|doctor|dental|hospital|vhi|laya/i, 'health'],
  [/tcd|trinity|college|tuition|book/i, 'education'],
  [/ryanair|aer lingus|airbnb|booking\.com|hostel|flight/i, 'travel'],
  [/fee|charge|interest/i, 'fees'],
  [/to savings|savings vault|vault/i, 'transfer'],
];

/**
 * Words that mean money came back, not money earned.
 *
 * Revolut writes a refund as a positive amount, which is indistinguishable
 * from wages by sign alone.
 */
const REFUND_WORDS = /refund|reversal|returned|chargeback|cashback|reimburse/i;

export function guessCategory(
  description: string,
  amountCents: number,
  type = '',
): SpendCategory {
  if (amountCents > 0) {
    // Revolut's Type is definitive where it exists: CARD_REFUND is a refund
    // however the merchant chose to name the line.
    const isRefund = /REFUND|REVERSAL|CHARGEBACK/i.test(type) || REFUND_WORDS.test(description);
    return isRefund ? 'refund' : 'income';
  }
  for (const [pattern, category] of HINTS) {
    if (pattern.test(description)) return category;
  }
  return 'other';
}

/**
 * Give a refund the category of the purchase it reverses, so it nets off.
 *
 * Every positive row used to be 'income'. An €80 jumper returned for €60
 * reported €80 of spending and €60 of income — wrong in both directions,
 * with the original never offset.
 *
 * Matching is narrow on purpose: same description and currency, an earlier
 * negative of at least the refund's size, within 90 days. A refund that
 * cannot be matched stays 'refund', which is excluded from both spending and
 * income rather than guessed into one of them.
 */
export function matchRefunds(rows: ParsedTxn[]): ParsedTxn[] {
  const spends = rows
    .filter((r) => r.amount_cents < 0)
    .sort((a, b) => a.posted_on.localeCompare(b.posted_on));

  return rows.map((row) => {
    // Anything positive is a candidate, not only rows already labelled a
    // refund: a Revolut refund is usually indistinguishable from income by
    // description alone, and matching it to its own purchase is the only
    // reliable signal there is.
    if (row.amount_cents <= 0) return row;
    if (row.category !== 'refund' && row.category !== 'income') return row;

    const original = spends.find(
      (s) =>
        s.description.toLowerCase() === row.description.toLowerCase() &&
        s.currency === row.currency &&
        s.posted_on <= row.posted_on &&
        Math.abs(s.amount_cents) >= row.amount_cents &&
        daysBetween(s.posted_on, row.posted_on) <= 90,
    );

    if (original) return { ...row, category: original.category };

    // Unmatched: a labelled refund stays a refund; anything else is income.
    return row;
  });
}

const daysBetween = (from: string, to: string) =>
  Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );

export function parseRevolutCsv(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ParsedTxn[] = [];
  const skipped: ParseResult['skipped'] = [];
  const foreign: Record<string, number> = {};
  const seen = new Map<string, number>();
  let pending = 0;

  if (lines.length === 0) return { rows, skipped, pending, foreign };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const at = (name: string) => header.indexOf(name);

  const iCompleted = at('completed date');
  const iStarted = at('started date');
  const iDescription = at('description');
  const iAmount = at('amount');
  const iFee = at('fee');
  const iState = at('state');
  const iCurrency = at('currency');
  const iType = at('type');

  if (iAmount === -1 || iDescription === -1 || (iCompleted === -1 && iStarted === -1)) {
    return {
      rows,
      skipped: [{ line: 1, reason: 'This does not look like a Revolut export.' }],
      pending,
      foreign,
    };
  }

  for (let n = 1; n < lines.length; n++) {
    const cells = splitCsvLine(lines[n]);
    const state = iState === -1 ? 'COMPLETED' : cells[iState]?.toUpperCase();
    const type = iType === -1 ? '' : (cells[iType] ?? '');

    // Pending transactions can still disappear. Importing one would put a
    // figure in the log that never actually happened.
    if (state && state !== 'COMPLETED') {
      pending++;
      continue;
    }

    const stamp = (iCompleted !== -1 ? cells[iCompleted] : '') || cells[iStarted] || '';
    const posted_on = stamp.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(posted_on)) {
      skipped.push({ line: n + 1, reason: 'No usable date' });
      continue;
    }

    const amount = Number(cells[iAmount]);
    const fee = iFee === -1 ? 0 : Number(cells[iFee] || 0);
    if (!Number.isFinite(amount)) {
      skipped.push({ line: n + 1, reason: 'No usable amount' });
      continue;
    }

    // The fee is a real cost and belongs on the same row; it always makes the
    // magnitude bigger, never smaller, whichever way the amount points.
    const feeCents = Number.isFinite(fee) ? roundToCents(Math.abs(fee) * 100) : 0;
    // Subtracting the fee is correct in both directions: a -32.50 payment
    // with a 0.50 fee cost 33.00, and 100.00 in with a 0.50 fee left 99.50.
    const amountCents = roundToCents(amount * 100);
    const withFee = amountCents - feeCents;

    if (withFee === 0) {
      skipped.push({ line: n + 1, reason: 'Zero amount' });
      continue;
    }

    const description = (cells[iDescription] || 'Transaction').slice(0, 300);

    const currency =
      iCurrency !== -1 && cells[iCurrency]
        ? cells[iCurrency].toUpperCase().slice(0, 3)
        : DEFAULT_CURRENCY;
    if (currency !== DEFAULT_CURRENCY) foreign[currency] = (foreign[currency] ?? 0) + 1;

    // Which occurrence of this exact row we are on, within this file.
    const fingerprint = `${posted_on}|${description}|${withFee}|${currency}`;
    const ordinal = (seen.get(fingerprint) ?? 0) + 1;
    seen.set(fingerprint, ordinal);

    rows.push({
      posted_on,
      description,
      amount_cents: withFee,
      currency,
      category: guessCategory(description, withFee, type),
      // Stable across re-exports of the same statement, which is what makes
      // re-importing safe. The unique index does the rest.
      //
      // The ordinal is load-bearing. Revolut's export carries no transaction
      // id, so the key is derived from the row — and without a position in
      // it, two £3.50 coffees at the same cafe on the same day hash
      // identically and the second is dropped as a duplicate. That is the
      // common case, not an edge case, and it silently under-reports
      // spending. Re-import stays idempotent because the same file produces
      // the same ordinals.
      external_id: `${posted_on}|${description}|${withFee}|${currency}|${ordinal}`.slice(0, 200),
    });
  }

  return { rows: matchRefunds(rows), skipped, pending, foreign };
}
