import { roundToCents, sumCents } from '@/lib/pay/money';
import { addDays } from '@/lib/time/dublin';
import {
  isSpending,
  type GoalLine,
  type Outgoing,
  type OutgoingCadence,
  type SpendCategory,
  type Txn,
} from './types';

/**
 * Money going out, and what it means for the goal.
 *
 * Same rounding discipline as lib/pay, for the same reason: round per item,
 * then sum the rounded parts. A screen whose rows do not add up to its total
 * destroys the app's credibility, and that is just as true of a budget as it
 * is of a payslip.
 *
 * Everything here is integer cents. Nothing in this file returns a float.
 */

/** Days in a cadence, used to pro-rata an outgoing onto an arbitrary window. */
const CADENCE_DAYS: Record<OutgoingCadence, number> = {
  weekly: 7,
  fortnightly: 14,
  // Averages, deliberately. A monthly rent is the same commitment whether
  // February or March; spreading it evenly is the only way to compare a
  // fortnight against a quarter without the answer depending on which months
  // the window happened to clip.
  monthly: 365.25 / 12,
  yearly: 365.25,
};

/** Whole days in an inclusive date range. */
export function daysInclusive(from: string, to: string): number {
  const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  return Math.round((at(to) - at(from)) / 86_400_000) + 1;
}

/** True when an outgoing was live at any point in the window. */
export function outgoingActiveIn(o: Outgoing, from: string, to: string): boolean {
  if (o.started_on > to) return false;
  if (o.ended_on !== null && o.ended_on < from) return false;
  return true;
}

/**
 * What one outgoing costs across a window.
 *
 * Pro-rata by the days it was actually live inside the window, not by the
 * whole window — an outgoing that ended in week one should not be charged
 * for week four. Rounded here, at the item.
 */
export function outgoingCostIn(o: Outgoing, from: string, to: string): number {
  if (!outgoingActiveIn(o, from, to)) return 0;

  const start = o.started_on > from ? o.started_on : from;
  const end = o.ended_on !== null && o.ended_on < to ? o.ended_on : to;
  const liveDays = daysInclusive(start, end);

  return roundToCents((o.amount_cents * liveDays) / CADENCE_DAYS[o.cadence]);
}

/** The whole outgoings bill for a window: the sum of the rounded parts. */
export function outgoingsTotalIn(outgoings: Outgoing[], from: string, to: string): number {
  return sumCents(outgoings.map((o) => outgoingCostIn(o, from, to)));
}

/** An outgoing expressed per week, for comparing commitments side by side. */
export function outgoingPerWeek(o: Outgoing): number {
  return roundToCents((o.amount_cents * 7) / CADENCE_DAYS[o.cadence]);
}

export interface CategoryTotal {
  category: SpendCategory;
  /** Positive: what was spent. Non-spend categories are excluded entirely. */
  cents: number;
  count: number;
}

/**
 * Spending by category over a window.
 *
 * Only outgoing money, and only categories that are actually spending —
 * transfers to savings and incoming wages are both excluded, because
 * counting either would answer a different question than the one asked.
 */
export function spendingByCategory(txns: Txn[], from: string, to: string): CategoryTotal[] {
  const buckets = new Map<SpendCategory, { cents: number; count: number }>();

  for (const t of txns) {
    if (t.posted_on < from || t.posted_on > to) continue;
    if (!isSpending(t.category)) continue;
    if (t.amount_cents >= 0) continue;

    const bucket = buckets.get(t.category) ?? { cents: 0, count: 0 };
    bucket.cents += -t.amount_cents;
    bucket.count += 1;
    buckets.set(t.category, bucket);
  }

  return [...buckets.entries()]
    .map(([category, b]) => ({ category, ...b }))
    .sort((a, b) => b.cents - a.cents);
}

export function totalSpending(txns: Txn[], from: string, to: string): number {
  return sumCents(spendingByCategory(txns, from, to).map((c) => c.cents));
}

/** What actually moved into savings in a window, from the transaction side. */
export function transfersIn(txns: Txn[], from: string, to: string): number {
  return sumCents(
    txns
      .filter((t) => t.posted_on >= from && t.posted_on <= to && t.category === 'transfer')
      .map((t) => Math.abs(t.amount_cents)),
  );
}

export interface GoalTarget {
  cents: number;
  lineCount: number;
  /** The weakest confidence present, which is what the total is worth. */
  weakest: 'quoted' | 'researched' | 'guess' | null;
  quotedCents: number;
  researchedCents: number;
  guessCents: number;
}

/**
 * The target, as the sum of its lines.
 *
 * A total is only as trustworthy as its least trustworthy part, so the
 * weakest confidence travels with it. Showing €4,200 without saying that
 * €3,000 of it is guesswork would be the same offence as showing an
 * unconfirmed shift as settled.
 */
export function goalTarget(lines: GoalLine[]): GoalTarget {
  const at = (c: GoalLine['confidence']) =>
    sumCents(lines.filter((l) => l.confidence === c).map((l) => l.amount_cents));

  const guessCents = at('guess');
  const researchedCents = at('researched');
  const quotedCents = at('quoted');

  return {
    cents: sumCents(lines.map((l) => l.amount_cents)),
    lineCount: lines.length,
    weakest:
      lines.length === 0
        ? null
        : guessCents > 0
          ? 'guess'
          : researchedCents > 0
            ? 'researched'
            : 'quoted',
    quotedCents,
    researchedCents,
    guessCents,
  };
}

export interface Cashflow {
  /** Rostered earnings across the window, from lib/pay. */
  earningsCents: number;
  /** Committed outgoings across the same window. */
  outgoingsCents: number;
  /** Discretionary spending recorded in the same window. */
  spendingCents: number;
  /** What is left once both are taken off. Can be negative. */
  surplusCents: number;
  /** Surplus expressed per week, which is the rate the goal is chased at. */
  perWeekCents: number;
  days: number;
}

/**
 * The figure that ties the three tabs together: earn this, owe that, keep
 * the difference.
 *
 * `earningsCents` is passed in rather than computed, because lib/pay owns
 * what a shift is worth and duplicating that here is how two screens start
 * disagreeing.
 */
export function cashflow(
  earningsCents: number,
  outgoings: Outgoing[],
  txns: Txn[],
  from: string,
  to: string,
): Cashflow {
  const days = daysInclusive(from, to);
  const outgoingsCents = outgoingsTotalIn(outgoings, from, to);
  const spendingCents = totalSpending(txns, from, to);
  const surplusCents = earningsCents - outgoingsCents - spendingCents;

  return {
    earningsCents,
    outgoingsCents,
    spendingCents,
    surplusCents,
    perWeekCents: days === 0 ? 0 : roundToCents((surplusCents * 7) / days),
    days,
  };
}

export interface GoalArrival {
  targetCents: number;
  savedCents: number;
  remainingCents: number;
  reached: boolean;
  perWeekCents: number | null;
  weeksRemaining: number | null;
  /** YYYY-MM-DD, or null when there is no rate to project from. */
  arrivesOn: string | null;
  /** Set when a deadline exists and the projection lands after it. */
  weeksLate: number | null;
  /** Why there is no projection, when there isn't one. */
  reason: string | null;
}

/**
 * When the goal is reached at a given weekly rate, and how late that is.
 *
 * This is the arithmetic behind the sentence the whole app exists to say.
 * It is deliberately dumb: it extrapolates one rate forward and nothing
 * else. It does not model a pay rise, a quiet January, or a rent increase,
 * and it must never be presented as though it did.
 */
export function goalArrival(
  targetCents: number,
  savedCents: number,
  perWeekCents: number | null,
  today: string,
  deadline: string | null,
): GoalArrival {
  const remainingCents = Math.max(0, targetCents - savedCents);
  const reached = targetCents > 0 && savedCents >= targetCents;

  const base = { targetCents, savedCents, remainingCents, reached, perWeekCents };

  if (targetCents === 0) {
    return {
      ...base,
      weeksRemaining: null,
      arrivesOn: null,
      weeksLate: null,
      reason: 'No target yet. Add what the trip will cost.',
    };
  }
  if (reached) {
    return { ...base, weeksRemaining: null, arrivesOn: null, weeksLate: null, reason: null };
  }
  if (perWeekCents === null || perWeekCents <= 0) {
    return {
      ...base,
      weeksRemaining: null,
      arrivesOn: null,
      weeksLate: null,
      reason:
        perWeekCents === null
          ? 'Not enough history to work out a rate yet.'
          : 'Nothing is being set aside, so there is no rate to project from.',
    };
  }

  const weeksRemaining = Math.ceil(remainingCents / perWeekCents);
  const arrivesOn = addDays(today, weeksRemaining * 7);

  return {
    ...base,
    weeksRemaining,
    arrivesOn,
    weeksLate:
      deadline !== null && arrivesOn > deadline
        ? Math.ceil(daysInclusive(deadline, arrivesOn) / 7)
        : null,
    reason: null,
  };
}

/**
 * How many more shifts of a given value would close a gap.
 *
 * "Six extra Sundays closes it" — the actionable half of the sentence. Takes
 * the value of a typical shift rather than assuming one, because what a
 * shift is worth is lib/pay's business.
 */
export function shiftsToClose(gapCents: number, typicalShiftCents: number): number | null {
  if (gapCents <= 0) return 0;
  if (typicalShiftCents <= 0) return null;
  return Math.ceil(gapCents / typicalShiftCents);
}

/* -- Where the goal actually stands ----------------------------------------
   The one sentence the app must always be able to say:

     "€4,200 by August. You're at €1,150. At the rate you're setting aside you
      land in October — six weeks late. Six extra Sundays closes it."

   Every clause of that is arithmetic, so all of it lives here rather than in
   a page or, worse, in the model. The goal screen, /budget and the AI's
   get_goal tool were each assembling it separately, which is three chances
   for three screens to disagree about the same number.
   ------------------------------------------------------------------------ */

export interface Standing {
  savedCents: number;
  /** What has actually been set aside per week, or null if too few entries. */
  perWeekCents: number | null;
  arrival: GoalArrival;
  /** Extra shifts of a typical size that would close the gap, if it is late. */
  extraShifts: number | null;
}

/**
 * The rate is what has actually been set aside, never what was earned.
 *
 * What you earn and what you keep are different numbers, and the projection
 * is only honest if it uses the second. Needs two contributions to have a
 * span at all; one entry is a data point, not a rate.
 */
export function contributionRate(
  contributions: { amount_cents: number; contributed_on: string }[],
): number | null {
  if (contributions.length < 2) return null;

  const dates = contributions.map((c) => c.contributed_on).sort();
  const weeks = Math.max(
    1,
    (Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) - Date.parse(`${dates[0]}T00:00:00Z`)) /
      (7 * 86_400_000),
  );

  return Math.round(sumCents(contributions.map((c) => c.amount_cents)) / weeks);
}

export function goalStanding({
  targetCents,
  contributions,
  today,
  deadline,
  typicalShiftCents,
}: {
  targetCents: number;
  contributions: { amount_cents: number; contributed_on: string }[];
  today: string;
  deadline: string | null;
  /** What one shift is typically worth, for "how many more would close it". */
  typicalShiftCents: number;
}): Standing {
  const savedCents = sumCents(contributions.map((c) => c.amount_cents));
  const perWeekCents = contributionRate(contributions);
  const arrival = goalArrival(targetCents, savedCents, perWeekCents, today, deadline);

  const extraShifts =
    arrival.weeksLate !== null && perWeekCents !== null
      ? shiftsToClose(arrival.weeksLate * perWeekCents, typicalShiftCents)
      : null;

  return { savedCents, perWeekCents, arrival, extraShifts };
}
