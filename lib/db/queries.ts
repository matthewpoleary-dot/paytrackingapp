import { createClient } from '@/lib/supabase/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { nextPeriodStart, periodEnd, previousPeriodStart } from '@/lib/pay/period';
import { addDays, dublinDate } from '@/lib/time/dublin';
import type { Settings, Shift } from '@/lib/pay/types';
import type { GoalLine, Outgoing, ProfileFact, Txn } from '@/lib/budget/types';

/**
 * Server-side reads. Every one of these runs as the signed-in Google user,
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

/**
 * The period containing a given Dublin date, generated from the anchor.
 *
 * Walks in either direction. Backwards matters: the anchor is set the day the
 * app is first opened, and shifts can be back-dated before it. An earlier
 * version clamped those to the first period, which meant a back-dated shift
 * counted in the calendar and the yearly total but appeared in no period at
 * all — the dashboard and the period view disagreed, and nothing said why.
 */
export function periodContaining(date: string, settings: Settings): Period {
  let startsOn = settings.period_anchor_date;
  const length = settings.pay_period_length;

  let guard = 0;
  while (periodEnd(startsOn, length) < date && guard++ < 2000) {
    startsOn = nextPeriodStart(startsOn, length);
  }
  while (date < startsOn && guard++ < 2000) {
    startsOn = previousPeriodStart(startsOn, length);
  }

  return { startsOn, endsOn: periodEnd(startsOn, length) };
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

/** Every shift from a date onwards. Used by the dashboard's long-term views. */
export async function getShiftsSince(from: string): Promise<Shift[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('shift')
    .select('*')
    .gte('work_date', from)
    .order('work_date', { ascending: true });
  return data ?? [];
}

/** All shifts on one Dublin day. */
export async function getShiftsOn(date: string): Promise<Shift[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('shift')
    .select('*')
    .eq('work_date', date)
    .order('planned_start_at', { ascending: true });
  return data ?? [];
}

export interface Goal {
  id: string;
  name: string;
  target_cents: number;
  target_date: string | null;
}

export interface Contribution {
  id: string;
  amount_cents: number;
  contributed_on: string;
  note: string | null;
}

/**
 * The live goal, or null.
 *
 * Tolerates the table not existing so the dashboard still renders on a
 * database where migration 2 has not been applied yet — a missing feature
 * should degrade to an invitation, not a 500.
 */
export async function getGoal(): Promise<Goal | null> {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('goal')
    .select('id, name, target_cents, target_date')
    .is('archived_at', null)
    .maybeSingle();
  if (error) return null;
  return data;
}

export async function getContributions(): Promise<Contribution[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('contribution')
    .select('id, amount_cents, contributed_on, note')
    .order('contributed_on', { ascending: true });
  if (error) return [];
  return data ?? [];
}

// ---------------------------------------------------------------------------
// v3: budget, memory and conversations
// ---------------------------------------------------------------------------

export async function getGoalLines(goalId: string): Promise<GoalLine[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('goal_line')
    .select('id, goal_id, label, amount_cents, confidence, source_url, source_checked_on, sort_order')
    .eq('goal_id', goalId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return [];
  return data ?? [];
}

export async function getOutgoings(): Promise<Outgoing[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('outgoing')
    .select('id, label, amount_cents, cadence, category, started_on, ended_on')
    .order('amount_cents', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function getTxns(from: string, to: string): Promise<Txn[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('txn')
    .select('id, posted_on, description, amount_cents, category, categorised_by, source, external_id')
    .gte('posted_on', from)
    .lte('posted_on', to)
    .order('posted_on', { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function getProfileFacts(): Promise<ProfileFact[]> {
  if (!hasSupabaseEnv()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profile_fact')
    .select('id, key, value, learned_on, confirmed_at, source')
    .order('key', { ascending: true });
  if (error) return [];
  return data ?? [];
}
