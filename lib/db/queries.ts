import { createClient } from '@/lib/supabase/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { nextPeriodStart, periodEnd } from '@/lib/pay/period';
import { addDays, dublinDate } from '@/lib/time/dublin';
import type { Settings, Shift } from '@/lib/pay/types';

/**
 * Server-side reads. Every one of these runs as the signed-in anonymous user,
 * so RLS is what scopes them — there is deliberately no `.eq('user_id', …)`
 * anywhere below. Adding one would hide a policy failure rather than prevent
 * it, and tests/rls.test.mjs exists to prove the policies hold.
 */

export async function getSettings(): Promise<Settings | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('*').maybeSingle();
  return data;
}

export interface Period {
  startsOn: string;
  endsOn: string;
}

/** The period containing a given Dublin date, generated from the anchor. */
export function periodContaining(date: string, settings: Settings): Period {
  let startsOn = settings.period_anchor_date;

  // Walk forward from the anchor. A user is realistically a handful of periods
  // past setup, and walking is exact where month arithmetic is fiddly.
  let guard = 0;
  while (periodEnd(startsOn, settings.pay_period_length) < date && guard++ < 600) {
    startsOn = nextPeriodStart(startsOn, settings.pay_period_length);
  }

  // Dates before the anchor belong to no generated period; clamp to the first.
  if (date < startsOn) startsOn = settings.period_anchor_date;

  return { startsOn, endsOn: periodEnd(startsOn, settings.pay_period_length) };
}

export function previousPeriod(period: Period, settings: Settings): Period {
  // Step back by walking forward from the anchor to whatever lands before it.
  let startsOn = settings.period_anchor_date;
  let previous: Period = { startsOn, endsOn: periodEnd(startsOn, settings.pay_period_length) };
  let guard = 0;
  while (startsOn < period.startsOn && guard++ < 600) {
    previous = { startsOn, endsOn: periodEnd(startsOn, settings.pay_period_length) };
    startsOn = nextPeriodStart(startsOn, settings.pay_period_length);
  }
  return previous;
}

export async function getShiftsBetween(from: string, to: string): Promise<Shift[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('shift')
    .select('*')
    .gte('work_date', from)
    .lte('work_date', to)
    .order('work_date', { ascending: true })
    .order('planned_start_at', { ascending: true });
  return data ?? [];
}

/** Shifts whose actuals the user has not confirmed, up to and including today. */
export async function getUnconfirmedShifts(): Promise<Shift[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('shift')
    .select('*')
    .is('actuals_confirmed_at', null)
    .lte('work_date', dublinDate())
    .order('work_date', { ascending: true });
  return data ?? [];
}

/**
 * The shape the user usually works: the most common start and end time, and
 * the usual break. What makes roster entry confirm-and-move-on rather than
 * type-it-all-again.
 */
export interface UsualShape {
  start: string;
  end: string;
  breakMinutes: number;
  /** False when there is no history yet and these are just sane defaults. */
  learned: boolean;
}

export async function getUsualShape(settings: Settings | null): Promise<UsualShape> {
  const fallback: UsualShape = {
    start: '17:00',
    end: '23:30',
    breakMinutes: settings?.default_break_minutes ?? 30,
    learned: false,
  };
  if (!hasSupabaseEnv()) return fallback;

  const supabase = await createClient();
  const { data } = await supabase
    .from('shift')
    .select('planned_start_at, planned_end_at, planned_break_minutes')
    .order('work_date', { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return fallback;

  const { dublinClock } = await import('@/lib/time/dublin');
  const mode = <T extends string | number>(values: T[]): T =>
    [...values]
      .sort(
        (a, b) =>
          values.filter((v) => v === b).length - values.filter((v) => v === a).length,
      )[0];

  return {
    start: mode(data.map((s) => dublinClock(s.planned_start_at))),
    end: mode(data.map((s) => dublinClock(s.planned_end_at))),
    breakMinutes: mode(data.map((s) => s.planned_break_minutes)),
    learned: true,
  };
}

/** Ensures a pay_period row exists for a range, so actual_paid has a home. */
export async function ensurePeriodRow(period: Period, userId: string): Promise<void> {
  if (!hasSupabaseEnv()) return;
  const supabase = await createClient();
  await supabase
    .from('pay_period')
    .upsert(
      { user_id: userId, starts_on: period.startsOn, ends_on: period.endsOn },
      { onConflict: 'user_id,starts_on', ignoreDuplicates: true },
    );
}

/** The seven dates of the week starting Monday that contains `date`. */
export function weekDates(startsOn: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startsOn, i));
}
