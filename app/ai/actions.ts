'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getGoal } from '@/lib/db/queries';
import { dublinDate } from '@/lib/time/dublin';
import { SPEND_CATEGORIES } from '@/lib/budget/types';

/**
 * Confirming a proposal.
 *
 * The AI never writes. It returns a card; this is what the card's button
 * calls. An ordinary server action, with the same validation any other form
 * would get — a proposal arriving from a model is untrusted input exactly
 * like a proposal arriving from a text field.
 *
 * There is deliberately no txn_category case. The model cannot see
 * transactions at all, which is what keeps a bank statement's text out of
 * its context entirely, so recategorising lives in the Budget tab where the
 * user picks from the closed enum themselves. The tool that used to be here
 * needed a txn_id no read tool could supply, so it could only be called with
 * an invented one — which matched no row, changed nothing, and still
 * reported success.
 */

export interface ConfirmResult {
  ok: boolean;
  error?: string;
}

const CADENCES = ['weekly', 'fortnightly', 'monthly', 'yearly'];
const CONFIDENCES = ['quoted', 'researched', 'guess'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function confirmProposal(
  kind: string,
  payload: Record<string, unknown>,
): Promise<ConfirmResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  switch (kind) {
    case 'goal_line': {
      const goal = await getGoal();
      if (!goal) return { ok: false, error: 'Set a goal first.' };

      const amount = Number(payload.amount_cents);
      const confidence = String(payload.confidence);
      if (!Number.isInteger(amount) || amount <= 0) {
        return { ok: false, error: 'That amount does not look right.' };
      }
      if (!CONFIDENCES.includes(confidence)) {
        return { ok: false, error: 'Unknown confidence.' };
      }
      // The database enforces this too. Checking here as well means the user
      // gets a sentence rather than a constraint violation.
      if (confidence === 'researched' && (!payload.source_url || !payload.source_checked_on)) {
        return { ok: false, error: 'A researched figure needs its source.' };
      }

      const { error } = await supabase.from('goal_line').insert({
        user_id: user.id,
        goal_id: goal.id,
        label: String(payload.label ?? '').slice(0, 80),
        amount_cents: amount,
        confidence,
        source_url: payload.source_url ? String(payload.source_url).slice(0, 2048) : null,
        source_checked_on: payload.source_checked_on ? String(payload.source_checked_on) : null,
      });
      if (error) return { ok: false, error: error.message };
      break;
    }

    case 'outgoing': {
      const amount = Number(payload.amount_cents);
      const cadence = String(payload.cadence);
      const startedOn = String(payload.started_on ?? '');
      if (!Number.isInteger(amount) || amount <= 0) {
        return { ok: false, error: 'That amount does not look right.' };
      }
      if (!CADENCES.includes(cadence)) return { ok: false, error: 'Unknown cadence.' };

      // Validated here as well as by the enum column, so a bad value from the
      // model reads as a sentence rather than a constraint violation.
      const category = String(payload.category ?? 'other');
      if (!SPEND_CATEGORIES.includes(category as never)) {
        return { ok: false, error: 'Unknown category.' };
      }
      if (!ISO_DATE.test(startedOn)) return { ok: false, error: 'That start date does not look right.' };

      const { error } = await supabase.from('outgoing').insert({
        user_id: user.id,
        label: String(payload.label ?? '').slice(0, 80),
        amount_cents: amount,
        cadence,
        category,
        started_on: startedOn,
      });
      if (error) return { ok: false, error: error.message };
      break;
    }

    case 'profile_fact': {
      const key = String(payload.key ?? '').slice(0, 60);
      const value = String(payload.value ?? '').slice(0, 500);
      if (!key || !value) return { ok: false, error: 'That fact is incomplete.' };

      // Confirmed, because the user just tapped it. The schema requires
      // anything user-sourced to be confirmed, and a tap IS the user saying so.
      const { error } = await supabase.from('profile_fact').upsert(
        {
          user_id: user.id,
          key,
          value,
          source: 'user',
          confirmed_at: new Date().toISOString(),
          learned_on: dublinDate(),
        },
        { onConflict: 'user_id,key' },
      );
      if (error) return { ok: false, error: error.message };
      break;
    }

    default:
      return { ok: false, error: `Unknown proposal: ${kind}` };
  }

  revalidatePath('/');
  revalidatePath('/budget');
  revalidatePath('/ai');
  return { ok: true };
}
