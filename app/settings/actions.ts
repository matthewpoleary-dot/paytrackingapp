'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/db/queries';
import { parseRateToCents, roundToCents } from '@/lib/pay/money';
import type { PayPeriodLength, SundayPremiumKind } from '@/lib/pay/types';

export interface SettingsState {
  error?: string;
}

const LENGTHS: readonly PayPeriodLength[] = ['weekly', 'fortnightly', 'monthly'];

export async function saveSettings(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const current = await getSettings();
  if (!current) redirect('/setup');

  const rateCents = parseRateToCents(String(formData.get('rate') ?? ''));
  if (rateCents === null) {
    return { error: 'That hourly rate doesn’t look right. Try something like 13.85.' };
  }

  const length = String(formData.get('period') ?? '') as PayPeriodLength;
  if (!LENGTHS.includes(length)) return { error: 'Pick how often you are paid.' };

  const breaksPaid = formData.get('breaks') === 'paid';

  const sundayAnswer = String(formData.get('sunday') ?? 'unknown');
  let sundayKind: SundayPremiumKind | null = null;
  let sundayPerHour: number | null = null;
  let sundayBasisPoints: number | null = null;

  if (sundayAnswer === 'none') {
    sundayKind = 'none';
  } else if (sundayAnswer === 'yes') {
    const shape = String(formData.get('sundayShape') ?? 'per_hour');
    const raw = String(formData.get('sundayValue') ?? '').trim();
    if (shape === 'multiplier') {
      const times = Number(raw.replace(',', '.').replace(/[x×\s]/gi, ''));
      if (!Number.isFinite(times) || times < 1 || times > 5) {
        return { error: 'Sunday multiplier should be something like 1.25 or 1.5.' };
      }
      sundayKind = 'multiplier';
      sundayBasisPoints = roundToCents(times * 10_000);
    } else {
      const extra = parseRateToCents(raw);
      if (extra === null) {
        return { error: 'Sunday extra should be an amount per hour, like 2.00.' };
      }
      sundayKind = 'per_hour';
      sundayPerHour = extra;
    }
  }

  const supabase = await createClient();

  // Note what is deliberately NOT touched: no shift is updated. Every shift
  // carries the rate it was worked at, so a rise applies from here forward and
  // last month stays worth what it was worth.
  const { error } = await supabase
    .from('settings')
    .update({
      hourly_rate_cents: rateCents,
      breaks_paid: breaksPaid,
      pay_period_length: length,
      sunday_premium_kind: sundayKind,
      sunday_premium_cents_per_hour: sundayPerHour,
      sunday_premium_basis_points: sundayBasisPoints,
    })
    .eq('id', current.id);

  if (error) return { error: `Could not save: ${error.message}` };

  revalidatePath('/');
  redirect('/');
}
