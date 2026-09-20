import { sumCents } from './money';
import type { Contribution, Goal } from '@/lib/db/queries';

/**
 * When the goal gets hit, at the rate money is actually being set aside.
 *
 * This is arithmetic over logged contributions, and it is labelled a
 * projection everywhere it appears. It is NOT a forecast of earnings: the app
 * already knows what you earned, and the whole point of tracking
 * contributions separately is that what you keep and what you earn are
 * different numbers. Projecting from earnings would quietly assume you save
 * all of it.
 *
 * Returns `null` for `weeksRemaining` whenever the honest answer is "not
 * enough to say" — one contribution is a data point, not a rate.
 */
export interface Projection {
  savedCents: number;
  targetCents: number;
  /** 0–1, clamped. */
  progress: number;
  remainingCents: number;
  reached: boolean;
  /** Average set aside per week over the span contributions actually cover. */
  perWeekCents: number | null;
  weeksRemaining: number | null;
  /** YYYY-MM-DD, or null when there is no rate to project from. */
  projectedDate: string | null;
  /** True when a target date exists and the projection lands after it. */
  behindTarget: boolean;
  /** Why no projection is shown, when there isn't one. */
  reason: string | null;
}

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

export function project(
  goal: Goal,
  contributions: Contribution[],
  today: string,
): Projection {
  const savedCents = sumCents(contributions.map((c) => c.amount_cents));
  const remainingCents = Math.max(0, goal.target_cents - savedCents);
  const progress = Math.min(1, Math.max(0, savedCents / goal.target_cents));
  const reached = savedCents >= goal.target_cents;

  const base = {
    savedCents,
    targetCents: goal.target_cents,
    progress,
    remainingCents,
    reached,
  };

  if (reached) {
    return { ...base, perWeekCents: null, weeksRemaining: null, projectedDate: null, behindTarget: false, reason: null };
  }

  if (contributions.length < 2) {
    return {
      ...base,
      perWeekCents: null,
      weeksRemaining: null,
      projectedDate: null,
      behindTarget: false,
      reason:
        contributions.length === 0
          ? 'Record what you set aside and a projection appears here.'
          : 'One contribution is a data point, not a rate. Add another.',
    };
  }

  // The span the contributions actually cover — first to last, not first to
  // today. Measuring to today would punish someone who front-loaded and then
  // paused, by inventing weeks of zero they never claimed.
  const dates = contributions.map((c) => c.contributed_on).sort();
  const first = Date.parse(`${dates[0]}T00:00:00Z`);
  const last = Date.parse(`${dates[dates.length - 1]}T00:00:00Z`);
  const weeksCovered = Math.max(1, (last - first) / MS_PER_WEEK);

  const perWeekCents = Math.round(savedCents / weeksCovered);

  if (perWeekCents <= 0) {
    return {
      ...base,
      perWeekCents,
      weeksRemaining: null,
      projectedDate: null,
      behindTarget: false,
      reason: 'Withdrawals cancel out what went in, so there is no rate to project from.',
    };
  }

  const weeksRemaining = Math.ceil(remainingCents / perWeekCents);
  const projected = new Date(Date.parse(`${today}T00:00:00Z`) + weeksRemaining * MS_PER_WEEK);
  const projectedDate = projected.toISOString().slice(0, 10);

  return {
    ...base,
    perWeekCents,
    weeksRemaining,
    projectedDate,
    behindTarget: goal.target_date !== null && projectedDate > goal.target_date,
    reason: null,
  };
}
