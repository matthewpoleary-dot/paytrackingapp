// Everything is stored UTC and displayed Europe/Dublin. This module is the
// only place that knows the display zone, so no call site has to remember.
//
// A "work date" is a Dublin calendar day, not a UTC one. A shift that starts
// 18:00 Saturday and finishes 01:20 Sunday belongs to Saturday.

export const DUBLIN = 'Europe/Dublin';

const ISO_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: DUBLIN,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The Dublin calendar day an instant falls on, as YYYY-MM-DD. */
export function dublinDate(instant: Date = new Date()): string {
  return ISO_DATE.format(instant);
}

const WEEKDAY = new Intl.DateTimeFormat('en-IE', {
  timeZone: DUBLIN,
  weekday: 'short',
});

const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
};

/** Day of the week in Dublin, Monday = 0. */
export function dublinWeekday(instant: Date = new Date()): number {
  return WEEKDAY_INDEX[WEEKDAY.format(instant).slice(0, 3)] ?? 0;
}

/** Shifts a YYYY-MM-DD string by whole days without touching a timezone. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return shifted.toISOString().slice(0, 10);
}

/**
 * The Monday of the week an instant falls in, Dublin time.
 *
 * Monday is an assumption, not a rule — Irish payroll weeks vary by employer.
 * It is the default anchor for a new user rather than something asked at first
 * run, because four questions is already pushing the "faster than Notes" bar.
 */
export function startOfDublinWeek(instant: Date = new Date()): string {
  return addDays(dublinDate(instant), -dublinWeekday(instant));
}

/** The first of the month an instant falls in, Dublin time. */
export function startOfDublinMonth(instant: Date = new Date()): string {
  return `${dublinDate(instant).slice(0, 7)}-01`;
}
