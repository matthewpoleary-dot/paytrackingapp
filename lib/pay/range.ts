import { addDays } from '@/lib/time/dublin';

/**
 * The span the dashboard is looking at.
 *
 * Deliberately separate from the pay period. A pay period is what an employer
 * pays against and is anchored to their cycle; a range is what the user wants
 * to look at right now. Conflating them would mean changing the view silently
 * changed what "this period is worth" meant.
 */
export type RangeKind = 'week' | 'month' | 'year';

export const RANGE_KINDS: readonly RangeKind[] = ['week', 'month', 'year'];

export function isRangeKind(value: unknown): value is RangeKind {
  return typeof value === 'string' && (RANGE_KINDS as readonly string[]).includes(value);
}

export interface Range {
  kind: RangeKind;
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  to: string;
}

const parts = (iso: string) => iso.split('-').map(Number) as [number, number, number];

const lastDayOf = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Monday-first, because the app's week and the Irish roster week both are. */
export function startOfWeek(iso: string): string {
  const [y, m, d] = parts(iso);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return addDays(iso, -dow);
}

export function rangeContaining(kind: RangeKind, date: string): Range {
  const [y, m] = parts(date);
  switch (kind) {
    case 'week': {
      const from = startOfWeek(date);
      return { kind, from, to: addDays(from, 6) };
    }
    case 'month':
      return {
        kind,
        from: `${date.slice(0, 7)}-01`,
        to: `${date.slice(0, 7)}-${String(lastDayOf(y, m)).padStart(2, '0')}`,
      };
    case 'year':
      return { kind, from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** The equivalent range one step earlier or later. */
export function stepRange(range: Range, direction: -1 | 1): Range {
  switch (range.kind) {
    case 'week':
      return rangeContaining('week', addDays(range.from, direction * 7));
    case 'month': {
      const [y, m] = parts(range.from);
      const d = new Date(Date.UTC(y, m - 1 + direction, 1));
      return rangeContaining(
        'month',
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`,
      );
    }
    case 'year': {
      const [y] = parts(range.from);
      return rangeContaining('year', `${y + direction}-01-01`);
    }
  }
}

const WEEK_LABEL = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});
const MONTH_LABEL = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

const utc = (iso: string) => {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d));
};

export function rangeLabel(range: Range): string {
  switch (range.kind) {
    case 'week':
      return `${WEEK_LABEL.format(utc(range.from))} – ${WEEK_LABEL.format(utc(range.to))}`;
    case 'month':
      return MONTH_LABEL.format(utc(range.from));
    case 'year':
      return range.from.slice(0, 4);
  }
}

/**
 * "This week" / "Last month" / "2025" — how the headline names the range.
 *
 * Relative wording only where it is unambiguous; anything further away gets
 * its actual name, because "3 months ago" makes the reader do arithmetic.
 */
export function relativeLabel(range: Range, today: string): string {
  const current = rangeContaining(range.kind, today);
  if (range.from === current.from) {
    return range.kind === 'week' ? 'This week' : range.kind === 'month' ? 'This month' : 'This year';
  }
  if (range.from === stepRange(current, -1).from) {
    return range.kind === 'week' ? 'Last week' : range.kind === 'month' ? 'Last month' : 'Last year';
  }
  if (range.from === stepRange(current, 1).from) {
    return range.kind === 'week' ? 'Next week' : range.kind === 'month' ? 'Next month' : 'Next year';
  }
  return rangeLabel(range);
}

/** True when the range lies entirely ahead of today — nothing worked yet. */
export function isFuture(range: Range, today: string): boolean {
  return range.from > today;
}
