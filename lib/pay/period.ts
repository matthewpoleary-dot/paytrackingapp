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
