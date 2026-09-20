import { valueShift, type ShiftValue } from './calc';
import { sumCents } from './money';
import type { Settings, Shift } from './types';

/**
 * Honesty in aggregate.
 *
 * The week view already refuses to show an unconfirmed figure as fact. Once
 * you roll days into months and months into a year, the same problem gets
 * quietly worse, not better — a month that is half estimates is an estimated
 * month, and an annual total built on it is an estimated annual total.
 *
 * So one rule, applied everywhere above the shift:
 *
 *   An aggregate is estimated if ANY shift inside it is unconfirmed.
 *
 * It is deliberately pessimistic. The alternative — "mostly confirmed, near
 * enough" — is how a figure you could not stand over ends up being quoted as
 * if you could. Alongside the flag, every aggregate carries its mix
 * (`confirmedCount` of `shiftCount`), so a screen can show *how* provisional
 * a number is rather than only that it is.
 *
 * `confirmedCents` is the part that is settled fact. Charts draw that solid
 * and the remainder hatched, so the uncertain portion is visible as a
 * quantity rather than collapsing into a single warning icon.
 */
export interface Aggregate {
  cents: number;
  /** Of that, the part backed by confirmed shifts. */
  confirmedCents: number;
  /** The remainder, still resting on the roster rather than on reality. */
  estimatedCents: number;
  estimated: boolean;
  shiftCount: number;
  confirmedCount: number;
  unconfirmedCount: number;
  paidMinutes: number;
  sundayWithoutPremium: boolean;
}

export const EMPTY_AGGREGATE: Aggregate = {
  cents: 0,
  confirmedCents: 0,
  estimatedCents: 0,
  estimated: false,
  shiftCount: 0,
  confirmedCount: 0,
  unconfirmedCount: 0,
  paidMinutes: 0,
  sundayWithoutPremium: false,
};

export function aggregateValues(values: ShiftValue[]): Aggregate {
  const confirmed = values.filter((v) => !v.estimated);
  const unconfirmed = values.filter((v) => v.estimated);

  return {
    cents: sumCents(values.map((v) => v.cents)),
    confirmedCents: sumCents(confirmed.map((v) => v.cents)),
    estimatedCents: sumCents(unconfirmed.map((v) => v.cents)),
    estimated: unconfirmed.length > 0,
    shiftCount: values.length,
    confirmedCount: confirmed.length,
    unconfirmedCount: unconfirmed.length,
    paidMinutes: values.reduce((total, v) => total + v.paidMinutes, 0),
    sundayWithoutPremium: values.some((v) => v.sundayWithoutPremium),
  };
}

export function aggregate(shifts: Shift[], settings: Settings): Aggregate {
  return aggregateValues(shifts.map((s) => valueShift(s, settings)));
}

export interface DayValue extends Aggregate {
  date: string;
}

/** Shifts grouped by the Dublin day they belong to. */
export function byDay(shifts: Shift[], settings: Settings): Map<string, DayValue> {
  const buckets = new Map<string, ShiftValue[]>();
  for (const shift of shifts) {
    const bucket = buckets.get(shift.work_date);
    if (bucket) bucket.push(valueShift(shift, settings));
    else buckets.set(shift.work_date, [valueShift(shift, settings)]);
  }

  const out = new Map<string, DayValue>();
  for (const [date, values] of buckets) {
    out.set(date, { date, ...aggregateValues(values) });
  }
  return out;
}

/** Shifts grouped by YYYY-MM. */
export function byMonth(shifts: Shift[], settings: Settings): Map<string, Aggregate> {
  const buckets = new Map<string, ShiftValue[]>();
  for (const shift of shifts) {
    const key = shift.work_date.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(valueShift(shift, settings));
    else buckets.set(key, [valueShift(shift, settings)]);
  }

  const out = new Map<string, Aggregate>();
  for (const [key, values] of buckets) out.set(key, aggregateValues(values));
  return out;
}

/**
 * How provisional an aggregate is, in a phrase.
 *
 * Returns null when there is nothing to caveat, so callers can render the
 * note or not without duplicating the condition.
 */
export function provisionalNote(a: Aggregate): string | null {
  if (!a.estimated || a.shiftCount === 0) return null;
  if (a.confirmedCount === 0) {
    return `All ${a.shiftCount} shift${a.shiftCount === 1 ? '' : 's'} still unconfirmed`;
  }
  return `${a.confirmedCount} of ${a.shiftCount} shifts confirmed`;
}

/** Shifts grouped by the Monday of the week they fall in. */
export function byWeek(shifts: Shift[], settings: Settings): Map<string, Aggregate> {
  const buckets = new Map<string, ShiftValue[]>();
  for (const shift of shifts) {
    const [y, m, d] = shift.work_date.split('-').map(Number);
    const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
    const monday = new Date(Date.UTC(y, m - 1, d - dow)).toISOString().slice(0, 10);
    const bucket = buckets.get(monday);
    if (bucket) bucket.push(valueShift(shift, settings));
    else buckets.set(monday, [valueShift(shift, settings)]);
  }

  const out = new Map<string, Aggregate>();
  for (const [monday, values] of buckets) out.set(monday, aggregateValues(values));
  return out;
}
