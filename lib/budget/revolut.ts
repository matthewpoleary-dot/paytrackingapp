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
  amount_cents: number;
  category: SpendCategory;
  external_id: string;
}

export interface ParseResult {
  rows: ParsedTxn[];
  /** Lines that could not be read, with why. Never silently dropped. */
  skipped: { line: number; reason: string }[];
  /** Rows present but not yet completed — excluded, because they may vanish. */
  pending: number;
}

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

export function guessCategory(description: string, amountCents: number): SpendCategory {
  if (amountCents > 0) return 'income';
  for (const [pattern, category] of HINTS) {
    if (pattern.test(description)) return category;
  }
  return 'other';
}

export function parseRevolutCsv(csv: string): ParseResult {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: ParsedTxn[] = [];
  const skipped: ParseResult['skipped'] = [];
  let pending = 0;

  if (lines.length === 0) return { rows, skipped, pending };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const at = (name: string) => header.indexOf(name);

  const iCompleted = at('completed date');
  const iStarted = at('started date');
  const iDescription = at('description');
  const iAmount = at('amount');
  const iFee = at('fee');
  const iState = at('state');
  const iCurrency = at('currency');

  if (iAmount === -1 || iDescription === -1 || (iCompleted === -1 && iStarted === -1)) {
    return {
      rows,
      skipped: [{ line: 1, reason: 'This does not look like a Revolut export.' }],
      pending,
    };
  }

  for (let n = 1; n < lines.length; n++) {
    const cells = splitCsvLine(lines[n]);
    const state = iState === -1 ? 'COMPLETED' : cells[iState]?.toUpperCase();

    // Pending transactions can still disappear. Importing one would put a
    // figure in the log that never actually happened.
    if (state && state !== 'COMPLETED') {
      pending++;
      continue;
    }

    if (iCurrency !== -1 && cells[iCurrency] && cells[iCurrency].toUpperCase() !== 'EUR') {
      skipped.push({ line: n + 1, reason: `Not in euro (${cells[iCurrency]})` });
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

    rows.push({
      posted_on,
      description,
      amount_cents: withFee,
      category: guessCategory(description, withFee),
      // Stable across re-exports of the same statement, which is what makes
      // re-importing safe. The unique index does the rest.
      external_id: `${posted_on}|${description}|${withFee}`.slice(0, 200),
    });
  }

  return { rows, skipped, pending };
}
