'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { parseRateToCents, roundToCents } from '@/lib/pay/money';
import { periodEnd } from '@/lib/pay/period';
import { startOfDublinMonth, startOfDublinWeek } from '@/lib/time/dublin';
import type { PayPeriodLength, SundayPremiumKind } from '@/lib/pay/types';

export interface SetupState {
  error?: string;
}

const LENGTHS: readonly PayPeriodLength[] = ['weekly', 'fortnightly', 'monthly'];

export async function saveSetup(
  _previous: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (!hasSupabaseEnv()) {
    return { error: 'Not connected to the database yet. Nothing was saved.' };
  }

  // --- Rate ----------------------------------------------------------------
  const rateCents = parseRateToCents(String(formData.get('rate') ?? ''));
  if (rateCents === null) {
    return { error: 'That hourly rate doesn’t look right. Try something like 13.85.' };
  }

  // --- Breaks --------------------------------------------------------------
  const breaksPaid = formData.get('breaks') === 'paid';

  // --- Pay period ----------------------------------------------------------
  const length = String(formData.get('period') ?? '') as PayPeriodLength;
  if (!LENGTHS.includes(length)) {
    return { error: 'Pick how often you are paid.' };
  }

  // --- Sunday --------------------------------------------------------------
  // The answer set is No / Yes / Not sure. "Not sure" is stored as NULL and is
  // deliberately not the same as 'none': only that distinction lets the app
  // later flag a possible s.14 entitlement. See docs/PAY-RULES.md.
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

  // --- Write ---------------------------------------------------------------
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The proxy gates this route, so arriving here without a user means the
  // session expired between loading the form and submitting it. Say that,
  // rather than naming a setting that stopped being relevant when anonymous
  // sessions were dropped — a wrong error message costs more than none.
  if (!user) {
    return { error: 'Your session expired. Sign in again and your answers will still be here.' };
  }

  const anchor =
    length === 'monthly' ? startOfDublinMonth() : startOfDublinWeek();

  const { error: settingsError } = await supabase.from('settings').insert({
    user_id: user.id,
    hourly_rate_cents: rateCents,
    breaks_paid: breaksPaid,
    pay_period_length: length,
    period_anchor_date: anchor,
    sunday_premium_kind: sundayKind,
    sunday_premium_cents_per_hour: sundayPerHour,
    sunday_premium_basis_points: sundayBasisPoints,
  });

  if (settingsError) {
    return { error: `Could not save your settings: ${settingsError.message}` };
  }

  // The period the user is in right now, so there is somewhere for shifts to
  // land and somewhere for actual_paid to go later.
  const { error: periodError } = await supabase.from('pay_period').insert({
    user_id: user.id,
    starts_on: anchor,
    ends_on: periodEnd(anchor, length),
  });

  if (periodError) {
    return { error: `Could not create your first pay period: ${periodError.message}` };
  }

  redirect('/');
}
