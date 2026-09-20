import { addDays } from '@/lib/time/dublin';
import type { PayPeriodLength } from './types';

/**
 * The last day of the period starting on `startsOn`, inclusive.
 *
 * Periods are pure date arithmetic — they never touch instants, so DST does
 * not enter into it. A period is a range of calendar days; what those days
 * are worth is a separate question answered from the shifts inside them.
 */
export function periodEnd(startsOn: string, length: PayPeriodLength): string {
  switch (length) {
    case 'weekly':
      return addDays(startsOn, 6);
    case 'fortnightly':
      return addDays(startsOn, 13);
    case 'monthly': {
      const [year, month] = startsOn.split('-').map(Number);
      // Day 0 of the next month is the last day of this one.
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      return `${startsOn.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
    }
  }
}

/** The period after this one. */
export function nextPeriodStart(
  startsOn: string,
  length: PayPeriodLength,
): string {
  return addDays(periodEnd(startsOn, length), 1);
}

/**
 * The period before this one.
 *
 * Needed because the anchor is set the day the app is first opened, and
 * shifts can be back-dated before it — a roster you are catching up on, or a
 * correction to last month. Without this, those dates belonged to no period
 * at all: they still counted in the calendar and the yearly total, but the
 * period view showed them nowhere, so the two disagreed.
 */
export function previousPeriodStart(
  startsOn: string,
  length: PayPeriodLength,
): string {
  switch (length) {
    case 'weekly':
      return addDays(startsOn, -7);
    case 'fortnightly':
      return addDays(startsOn, -14);
    case 'monthly': {
      const [year, month] = startsOn.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 2, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
    }
  }
}
