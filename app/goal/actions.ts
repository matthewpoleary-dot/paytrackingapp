'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getGoal } from '@/lib/db/queries';
import { parseRateToCents } from '@/lib/pay/money';
import { dublinDate } from '@/lib/time/dublin';

export interface GoalState {
  error?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses an amount in euro to integer cents. Shares the rate parser's rules. */
function parseAmount(input: string): number | null {
  return parseRateToCents(input);
}

export async function saveGoal(
  _previous: GoalState,
  formData: FormData,
): Promise<GoalState> {
  const name = String(formData.get('name') ?? '').trim() || 'Savings goal';
  const targetCents = parseAmount(String(formData.get('target') ?? ''));
  const targetDateRaw = String(formData.get('targetDate') ?? '').trim();

  if (targetCents === null) {
    return { error: 'That target doesn’t look right. Try something like 3000.' };
  }
  if (targetDateRaw && !DATE.test(targetDateRaw)) {
    return { error: 'That target date doesn’t look right.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Could not start a session.' };

  const existing = await getGoal();
  const row = {
    name: name.slice(0, 80),
    target_cents: targetCents,
    target_date: targetDateRaw || null,
  };

  const { error } = existing
    ? await supabase.from('goal').update(row).eq('id', existing.id)
    : await supabase.from('goal').insert({ ...row, user_id: user.id });

  if (error) return { error: `Could not save that goal: ${error.message}` };

  revalidatePath('/');
  redirect('/goal');
}

export async function addContribution(
  _previous: GoalState,
  formData: FormData,
): Promise<GoalState> {
  const raw = String(formData.get('amount') ?? '').trim();
  const withdrawal = formData.get('direction') === 'out';
  const dateRaw = String(formData.get('date') ?? '').trim() || dublinDate();
  const note = String(formData.get('note') ?? '').trim();

  const magnitude = parseAmount(raw);
  if (magnitude === null) {
    return { error: 'That amount doesn’t look right. Try something like 50.' };
  }
  if (!DATE.test(dateRaw)) return { error: 'That date doesn’t look right.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Could not start a session.' };

  const goal = await getGoal();

  const { error } = await supabase.from('contribution').insert({
    user_id: user.id,
    goal_id: goal?.id ?? null,
    // A withdrawal is the same row with a negative amount, so the running
    // total stays a plain sum.
    amount_cents: withdrawal ? -magnitude : magnitude,
    contributed_on: dateRaw,
    note: note ? note.slice(0, 200) : null,
    source: 'manual' as const,
  });

  if (error) return { error: `Could not save that: ${error.message}` };

  revalidatePath('/');
  redirect('/goal');
}

export async function deleteContribution(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('contribution').delete().eq('id', id);

  revalidatePath('/');
  redirect('/goal');
}
