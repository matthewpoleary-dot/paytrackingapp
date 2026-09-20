'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSettings, periodContaining, ensurePeriodRow } from '@/lib/db/queries';
import { shiftInstants } from '@/lib/time/dublin';

export interface RosterState {
  error?: string;
}

interface DraftShift {
  workDate: string;
  start: string;
  end: string;
  breakMinutes: number;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveRoster(
  _previous: RosterState,
  formData: FormData,
): Promise<RosterState> {
  const settings = await getSettings();
  if (!settings) return { error: 'Set your rate first.' };

  let drafts: DraftShift[];
  try {
    drafts = JSON.parse(String(formData.get('shifts') ?? '[]'));
  } catch {
    return { error: 'Could not read those shifts. Try again.' };
  }

  if (drafts.length === 0) return { error: 'Add at least one shift.' };

  for (const d of drafts) {
    if (!DATE.test(d.workDate)) return { error: 'Pick a day for every shift.' };
    if (!TIME.test(d.start) || !TIME.test(d.end)) {
      return { error: 'Every shift needs a start and a finish time.' };
    }
    if (d.start === d.end) {
      return { error: 'A shift cannot start and finish at the same time.' };
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Could not start a session.' };

  const rows = drafts.map((d) => {
    // Local wall clock in, instants out. An end at or before the start means
    // the shift ran past midnight and belongs to the following day — but the
    // work_date stays the day it started, which is the day it "is".
    const { startAt, endAt } = shiftInstants(d.workDate, d.start, d.end);
    return {
      user_id: user.id,
      work_date: d.workDate,
      planned_start_at: startAt.toISOString(),
      planned_end_at: endAt.toISOString(),
      planned_break_minutes: settings.breaks_paid ? 0 : d.breakMinutes,
      source: 'manual' as const,
      // The rate is fixed to the shift now, so a later pay rise cannot
      // retrospectively re-price it.
      hourly_rate_cents: settings.hourly_rate_cents,
    };
  });

  const { error } = await supabase.from('shift').insert(rows);
  if (error) return { error: `Could not save those shifts: ${error.message}` };

  // Make sure every period these shifts land in has a row, so actual_paid has
  // somewhere to go later.
  const periods = new Set(drafts.map((d) => periodContaining(d.workDate, settings).startsOn));
  for (const startsOn of periods) {
    await ensurePeriodRow(periodContaining(startsOn, settings), user.id);
  }

  revalidatePath('/');
  redirect('/');
}
