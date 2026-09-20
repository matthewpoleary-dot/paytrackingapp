'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/db/queries';
import { dublinInstant, addDays } from '@/lib/time/dublin';

export interface ConfirmState {
  error?: string;
}

interface Answer {
  id: string;
  /** Dublin work date the shift started on. */
  workDate: string;
  /** Actual finish, HH:MM local. */
  end: string;
  /** Actual break taken, minutes. Ignored where breaks are paid. */
  breakMinutes: number;
  /** The planned start, HH:MM local — needed to detect crossing midnight. */
  start: string;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveConfirmations(
  _previous: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const settings = await getSettings();
  if (!settings) return { error: 'Set your rate first.' };

  let answers: Answer[];
  try {
    answers = JSON.parse(String(formData.get('answers') ?? '[]'));
  } catch {
    return { error: 'Could not read those answers. Try again.' };
  }
  if (answers.length === 0) return { error: 'Nothing to confirm.' };

  for (const a of answers) {
    if (!TIME.test(a.end)) return { error: 'Every shift needs a finish time.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Could not start a session.' };

  const confirmedAt = new Date().toISOString();

  for (const a of answers) {
    let endAt = dublinInstant(a.workDate, a.end);
    // Same midnight rule as entry: a finish at or before the start belongs to
    // the next day. Confirming "1:20" against a 6pm start must not produce a
    // negative shift.
    if (a.end <= a.start) endAt = dublinInstant(addDays(a.workDate, 1), a.end);

    const { error } = await supabase
      .from('shift')
      .update({
        actual_end_at: endAt.toISOString(),
        actual_break_minutes: settings.breaks_paid ? null : a.breakMinutes,
        // The contemporaneity stamp. This is what turns the log into a record
        // of when you said it, not just what you said.
        actuals_confirmed_at: confirmedAt,
      })
      .eq('id', a.id);

    if (error) return { error: `Could not save: ${error.message}` };
  }

  revalidatePath('/');
  redirect('/');
}
