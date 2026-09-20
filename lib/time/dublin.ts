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

// ---------------------------------------------------------------------------
// Wall clock <-> instant
// ---------------------------------------------------------------------------

const WALL = new Intl.DateTimeFormat('en-CA', {
  timeZone: DUBLIN,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
});

/** Dublin's UTC offset in milliseconds at a given instant. */
function offsetAt(instant: Date): number {
  const p: Record<string, string> = {};
  for (const { type, value } of WALL.formatToParts(instant)) p[type] = value;
  const asIfUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  return asIfUtc - instant.getTime();
}

/**
 * The instant at which a given Dublin wall-clock time occurs.
 *
 * Two passes, because the offset depends on the instant we are solving for.
 * On the two changeover nights a naive single pass lands an hour out, and an
 * hour out is an hour of pay.
 */
export function dublinInstant(isoDate: string, time: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);

  let ts = wallAsUtc;
  for (let i = 0; i < 2; i++) ts = wallAsUtc - offsetAt(new Date(ts));
  return new Date(ts);
}

/**
 * Start and end instants for a shift described in local time.
 *
 * An end that is at or before the start means the shift ran past midnight, so
 * it lands on the following day — `18:00` to `01:20` is seven hours and
 * twenty minutes, not a negative number.
 */
export function shiftInstants(workDate: string, start: string, end: string) {
  const startAt = dublinInstant(workDate, start);
  let endAt = dublinInstant(workDate, end);
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = dublinInstant(addDays(workDate, 1), end);
  }
  return { startAt, endAt };
}

const TIME_FMT = new Intl.DateTimeFormat('en-IE', {
  timeZone: DUBLIN, hour: 'numeric', minute: '2-digit', hour12: true,
});

/** "5:00 pm" -> "5pm", "1:20 am" -> "1:20am". Compact, for dense rows. */
export function formatDublinTime(instant: Date | string): string {
  const s = TIME_FMT.format(new Date(instant)).toLowerCase().replace(/\s/g, '');
  return s.replace(/:00(?=[ap]m$)/, '');
}

/** The HH:MM Dublin wall clock of an instant, for prefilling a time input. */
export function dublinClock(instant: Date | string): string {
  const p: Record<string, string> = {};
  for (const { type, value } of WALL.formatToParts(new Date(instant))) p[type] = value;
  return `${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
}

const DAY_FMT = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC', weekday: 'short', day: 'numeric',
});

/** "Fri 26", from a YYYY-MM-DD work date. */
export function formatWorkDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return DAY_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

const RANGE_FMT = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC', day: 'numeric', month: 'short',
});

/** "21 – 27 Sep", from two YYYY-MM-DD dates. */
export function formatDateRange(fromIso: string, toIso: string): string {
  const at = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const from = at(fromIso);
  const to = at(toIso);
  const sameMonth = fromIso.slice(0, 7) === toIso.slice(0, 7);
  const left = sameMonth
    ? new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', day: 'numeric' }).format(from)
    : RANGE_FMT.format(from);
  return `${left} – ${RANGE_FMT.format(to)}`;
}

/** Is this Dublin work date a Sunday? */
export function isSundayWorkDate(isoDate: string): boolean {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 0;
}
