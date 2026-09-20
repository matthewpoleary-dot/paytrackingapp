import { minutesBetween, roundToCents, sumCents } from './money';
import { DUBLIN } from '@/lib/time/dublin';
import type { Settings, Shift } from './types';

/**
 * What a shift is worth, and whether that figure is a fact or a guess.
 *
 * Everything the UI needs to render a shift row comes from here, including
 * the estimated/confirmed state, so no screen has to re-derive it and get it
 * subtly different.
 */
export interface ShiftValue {
  shiftId: string;
  /** True until the user has confirmed what actually happened. */
  estimated: boolean;
  /** Minutes actually paid: worked time, less any unpaid break. */
  paidMinutes: number;
  /** Of those, the ones falling on a Sunday in Dublin. */
  sundayMinutes: number;
  /** Rounded to the cent, here and only here. */
  cents: number;
  /**
   * True when Sunday hours were worked but no premium exists to apply —
   * either the user said "no premium" or never said. Lets the app surface
   * that a s.14 OWTA 1997 entitlement might exist. See docs/PAY-RULES.md.
   */
  sundayWithoutPremium: boolean;
}

/** The end time to value the shift at: the real one if known, else the plan. */
function effectiveEnd(shift: Shift): Date {
  return new Date(shift.actual_end_at ?? shift.planned_end_at);
}

/** The break to deduct: the real one if known, else the plan. */
function effectiveBreakMinutes(shift: Shift, settings: Settings): number {
  if (settings.breaks_paid) return 0;
  return shift.actual_break_minutes ?? shift.planned_break_minutes;
}

const DUBLIN_WEEKDAY = new Intl.DateTimeFormat('en-IE', {
  timeZone: DUBLIN,
  weekday: 'short',
});

function isSundayInDublin(instant: Date): boolean {
  return DUBLIN_WEEKDAY.format(instant).startsWith('Sun');
}

/**
 * How many minutes of a worked interval fall on a Sunday in Dublin.
 *
 * Walked minute by minute rather than computed from a midnight boundary,
 * because the boundary itself moves: on the DST changeover nights a "day" is
 * 23 or 25 hours long, and arithmetic that assumes 24 gets it wrong twice a
 * year. A shift is at most a few hundred iterations, so the honest version is
 * cheap enough.
 */
function sundayMinutesIn(start: Date, end: Date): number {
  const total = minutesBetween(start, end);
  let sunday = 0;
  for (let m = 0; m < total; m++) {
    if (isSundayInDublin(new Date(start.getTime() + m * 60_000))) sunday++;
  }
  return sunday;
}

/** The hourly rate that applies to Sunday minutes, in cents. */
function sundayRateCents(baseCents: number, settings: Settings): number | null {
  switch (settings.sunday_premium_kind) {
    case 'per_hour':
      return baseCents + (settings.sunday_premium_cents_per_hour ?? 0);
    case 'multiplier':
      return (baseCents * (settings.sunday_premium_basis_points ?? 10_000)) / 10_000;
    // 'none' is "my contract gives me nothing extra". null is "I don't know".
    // Neither lets the app add anything, but they are recorded differently
    // and only the app's warning distinguishes them.
    default:
      return null;
  }
}

export function valueShift(shift: Shift, settings: Settings): ShiftValue {
  const start = new Date(shift.planned_start_at);
  const end = effectiveEnd(shift);

  const workedMinutes = Math.max(0, minutesBetween(start, end));
  const breakMinutes = Math.min(effectiveBreakMinutes(shift, settings), workedMinutes);
  const paidMinutes = workedMinutes - breakMinutes;

  const sundayWorked = sundayMinutesIn(start, end);

  // The break is taken pro rata across the shift rather than assigned to one
  // side of midnight. Any other split would be a guess about when the break
  // was actually taken, and the app does not know that.
  const paidFraction = workedMinutes === 0 ? 0 : paidMinutes / workedMinutes;
  const sundayPaidMinutes = sundayWorked * paidFraction;
  const normalPaidMinutes = paidMinutes - sundayPaidMinutes;

  const premium = sundayRateCents(settings.hourly_rate_cents, settings);
  const sundayRate = premium ?? settings.hourly_rate_cents;

  // Rounded once, here, at the shift. A period total is the sum of these, so
  // the rows on screen always add up to the total above them.
  const cents = roundToCents(
    (normalPaidMinutes * shift.hourly_rate_cents) / 60 +
      (sundayPaidMinutes * (premium === null ? shift.hourly_rate_cents : sundayRate)) / 60,
  );

  return {
    shiftId: shift.id,
    estimated: shift.actuals_confirmed_at === null,
    paidMinutes,
    sundayMinutes: Math.round(sundayPaidMinutes),
    cents,
    sundayWithoutPremium: sundayWorked > 0 && premium === null,
  };
}

export interface PeriodValue {
  cents: number;
  /** True if any shift in the period is still unconfirmed. */
  estimated: boolean;
  shiftCount: number;
  unconfirmedCount: number;
  paidMinutes: number;
  /** Any Sunday hours worked with no premium to apply. */
  sundayWithoutPremium: boolean;
  byShift: ShiftValue[];
}

export function valuePeriod(shifts: Shift[], settings: Settings): PeriodValue {
  const byShift = shifts.map((shift) => valueShift(shift, settings));
  const unconfirmed = byShift.filter((v) => v.estimated);

  return {
    cents: sumCents(byShift.map((v) => v.cents)),
    estimated: unconfirmed.length > 0,
    shiftCount: byShift.length,
    unconfirmedCount: unconfirmed.length,
    paidMinutes: byShift.reduce((total, v) => total + v.paidMinutes, 0),
    sundayWithoutPremium: byShift.some((v) => v.sundayWithoutPremium),
    byShift,
  };
}

/** "6h 30m", for a duration in minutes. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
