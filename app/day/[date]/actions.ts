'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSettings, periodContaining, ensurePeriodRow } from '@/lib/db/queries';
import { shiftInstants, dublinInstant, addDays } from '@/lib/time/dublin';

export interface DayState {
  error?: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Add one shift from the calendar.
 *
 * Deliberately the same write as the roster flow — same columns, same midnight
 * rule, same rate snapshot. The roster screen is bulk entry and this is a
 * one-off, but there is one way a shift comes into existence, not two.
 */
export async function addShiftOnDay(
  _previous: DayState,
  formData: FormData,
): Promise<DayState> {
  const settings = await getSettings();
  if (!settings) return { error: 'Set your rate first.' };

  const workDate = String(formData.get('workDate') ?? '');
  const start = String(formData.get('start') ?? '');
  const end = String(formData.get('end') ?? '');
  const breakMinutes = Number(formData.get('breakMinutes') ?? 0);

  if (!DATE.test(workDate)) return { error: 'That date does not look right.' };
  if (!TIME.test(start) || !TIME.test(end)) {
    return { error: 'A shift needs a start and a finish time.' };
  }
  if (start === end) return { error: 'A shift cannot start and finish at the same time.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Could not start a session.' };

  const { startAt, endAt } = shiftInstants(workDate, start, end);

  const { error } = await supabase.from('shift').insert({
    user_id: user.id,
    work_date: workDate,
    planned_start_at: startAt.toISOString(),
    planned_end_at: endAt.toISOString(),
    planned_break_minutes: settings.breaks_paid ? 0 : breakMinutes,
    source: 'manual' as const,
    hourly_rate_cents: settings.hourly_rate_cents,
  });
  if (error) return { error: `Could not save that shift: ${error.message}` };

  await ensurePeriodRow(periodContaining(workDate, settings), user.id);

  revalidatePath('/');
  revalidatePath('/period');
  redirect(`/day/${workDate}`);
}

/** Edit one shift in place — times, break, and its confirmed actuals. */
export async function updateShift(
  _previous: DayState,
  formData: FormData,
): Promise<DayState> {
  const settings = await getSettings();
  if (!settings) return { error: 'Set your rate first.' };

  const id = String(formData.get('id') ?? '');
  const workDate = String(formData.get('workDate') ?? '');
  const start = String(formData.get('start') ?? '');
  const end = String(formData.get('end') ?? '');
  const breakMinutes = Number(formData.get('breakMinutes') ?? 0);
  const confirm = formData.get('confirm') === 'on';
  const actualEnd = String(formData.get('actualEnd') ?? '');
  const actualBreak = Number(formData.get('actualBreak') ?? 0);

  if (!id || !DATE.test(workDate)) return { error: 'That shift does not look right.' };
  if (!TIME.test(start) || !TIME.test(end)) {
    return { error: 'A shift needs a start and a finish time.' };
  }
  if (confirm && !TIME.test(actualEnd)) {
    return { error: 'Confirming needs an actual finish time.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Could not start a session.' };

  const { startAt, endAt } = shiftInstants(workDate, start, end);

  const patch: Record<string, unknown> = {
    planned_start_at: startAt.toISOString(),
    planned_end_at: endAt.toISOString(),
    planned_break_minutes: settings.breaks_paid ? 0 : breakMinutes,
  };

  if (confirm) {
    let actualEndAt = dublinInstant(workDate, actualEnd);
    if (actualEnd <= start) actualEndAt = dublinInstant(addDays(workDate, 1), actualEnd);
    patch.actual_end_at = actualEndAt.toISOString();
    patch.actual_break_minutes = settings.breaks_paid ? null : actualBreak;
    patch.actuals_confirmed_at = new Date().toISOString();
  } else {
    // Un-confirming returns the shift to an estimate rather than leaving a
    // stale "actual" behind that nothing would ever correct.
    patch.actual_end_at = null;
    patch.actual_break_minutes = null;
    patch.actuals_confirmed_at = null;
  }

  const { error } = await supabase.from('shift').update(patch).eq('id', id);
  if (error) return { error: `Could not save: ${error.message}` };

  revalidatePath('/');
  revalidatePath('/period');
  redirect(`/day/${workDate}`);
}

export async function deleteShift(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const workDate = String(formData.get('workDate') ?? '');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('shift').delete().eq('id', id);

  revalidatePath('/');
  revalidatePath('/period');
  redirect(`/day/${workDate}`);
}
