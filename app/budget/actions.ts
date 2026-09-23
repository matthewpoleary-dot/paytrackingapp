'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getGoal } from '@/lib/db/queries';
import { parseRateToCents } from '@/lib/pay/money';
import { parseRevolutCsv } from '@/lib/budget/revolut';
import { SPEND_CATEGORIES } from '@/lib/budget/types';
import { dublinDate } from '@/lib/time/dublin';

export interface BudgetState {
  error?: string;
  message?: string;
}

const CADENCES = ['weekly', 'fortnightly', 'monthly', 'yearly'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Plain edit, because a conversation is a terrible way to fix a typo. */
export async function saveOutgoing(
  _previous: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const id = String(formData.get('id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const amount = parseRateToCents(String(formData.get('amount') ?? ''));
  const cadence = String(formData.get('cadence') ?? '');
  const category = String(formData.get('category') ?? 'other');
  const startedOn = String(formData.get('started_on') ?? '') || dublinDate();

  if (!label) return { error: 'Give it a name.' };
  if (amount === null) return { error: 'That amount does not look right.' };
  if (!CADENCES.includes(cadence)) return { error: 'Pick how often it goes out.' };
  if (!SPEND_CATEGORIES.includes(category as never)) return { error: 'Unknown category.' };
  if (!ISO_DATE.test(startedOn)) return { error: 'That start date does not look right.' };

  const row = {
    label: label.slice(0, 80),
    amount_cents: amount,
    cadence,
    category,
    started_on: startedOn,
  };

  const { error } = id
    ? await supabase.from('outgoing').update(row).eq('id', id)
    : await supabase.from('outgoing').insert({ ...row, user_id: user.id });

  if (error) return { error: error.message };

  revalidatePath('/budget');
  revalidatePath('/');
  return { message: id ? 'Updated.' : 'Added.' };
}

/**
 * Ending an outgoing, not deleting it.
 *
 * Rent that ran January to June is a true fact about January to June, and a
 * budget that forgets it cannot explain where the money went.
 */
export async function endOutgoing(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;

  const supabase = await createClient();
  await supabase.from('outgoing').update({ ended_on: dublinDate() }).eq('id', id);

  revalidatePath('/budget');
  revalidatePath('/');
}

export async function saveGoalLine(
  _previous: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const goal = await getGoal();
  if (!goal) return { error: 'Set a goal first.' };

  const id = String(formData.get('id') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const amount = parseRateToCents(String(formData.get('amount') ?? ''));
  const confidence = String(formData.get('confidence') ?? 'guess');
  const sourceUrl = String(formData.get('source_url') ?? '').trim();

  if (!label) return { error: 'Give it a name.' };
  if (amount === null) return { error: 'That amount does not look right.' };
  if (confidence === 'researched' && !sourceUrl) {
    return { error: 'A researched figure needs the link you found it at.' };
  }

  const row = {
    label: label.slice(0, 80),
    amount_cents: amount,
    confidence,
    source_url: sourceUrl || null,
    source_checked_on: confidence === 'researched' ? dublinDate() : null,
  };

  const { error } = id
    ? await supabase.from('goal_line').update(row).eq('id', id)
    : await supabase.from('goal_line').insert({ ...row, user_id: user.id, goal_id: goal.id });

  if (error) return { error: error.message };

  revalidatePath('/budget');
  revalidatePath('/goal');
  return { message: id ? 'Updated.' : 'Added.' };
}

export async function deleteGoalLine(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const supabase = await createClient();
  await supabase.from('goal_line').delete().eq('id', id);
  revalidatePath('/budget');
  revalidatePath('/goal');
}

/**
 * Revolut CSV import.
 *
 * Idempotent: every row carries a stable external_id and the unique index
 * refuses a second copy, so re-importing an overlapping statement adds only
 * what is new. The count of skipped duplicates is reported rather than
 * hidden, because "nothing happened" and "it was already there" look the
 * same otherwise.
 */
export async function importCsv(
  _previous: BudgetState,
  formData: FormData,
): Promise<BudgetState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Not signed in.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Pick a CSV file first.' };
  if (file.size > 5_000_000) return { error: 'That file is too big to be a statement.' };

  const parsed = parseRevolutCsv(await file.text());
  if (parsed.rows.length === 0) {
    return {
      error:
        parsed.skipped[0]?.reason ??
        'No usable transactions in that file. It should be a Revolut CSV export.',
    };
  }

  // One statement, so it either lands or it does not. Row by row, a failure
  // at row 400 of 500 left the user with 399 rows, an error message and no
  // way to tell which — and re-importing then depended on the key being
  // right, which is the other half of this bug.
  const { data: inserted, error } = await supabase
    .from('txn')
    .upsert(
      parsed.rows.map((row) => ({
        user_id: user.id,
        posted_on: row.posted_on,
        description: row.description,
        amount_cents: row.amount_cents,
        currency: row.currency,
        category: row.category,
        categorised_by: 'model' as const,
        source: 'revolut_csv' as const,
        external_id: row.external_id,
      })),
      { onConflict: 'user_id,source,external_id', ignoreDuplicates: true },
    )
    .select('id');

  if (error) return { error: error.message };

  const added = inserted?.length ?? 0;
  const already = parsed.rows.length - added;

  revalidatePath('/budget');
  revalidatePath('/');

  // Every count is stated, because "nothing happened" and "you already had
  // all of these" look identical otherwise.
  const parts = [`${added} added`];
  if (already) parts.push(`${already} already imported`);
  if (parsed.pending) parts.push(`${parsed.pending} still pending, skipped`);
  if (parsed.skipped.length) parts.push(`${parsed.skipped.length} unreadable`);

  // Captured, but deliberately not summed into euro totals.
  const foreign = Object.entries(parsed.foreign);
  for (const [code, count] of foreign) {
    parts.push(`${count} in ${code}, stored but not counted`);
  }

  return { message: parts.join(' · ') };
}

export async function setTxnCategory(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const category = String(formData.get('category') ?? '');
  if (!id || !SPEND_CATEGORIES.includes(category as never)) return;

  const supabase = await createClient();
  await supabase.from('txn').update({ category, categorised_by: 'user' }).eq('id', id);
  revalidatePath('/budget');
}
