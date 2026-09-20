// Domain types mirroring supabase/migrations/20260920120000_initial_schema.sql.

export type PayPeriodLength = 'weekly' | 'fortnightly' | 'monthly';

/**
 * NULL is a real answer: "not sure". It is NOT the same as 'none'.
 *
 * There is no statutory Sunday multiplier in Ireland — s.14 OWTA 1997 gives a
 * right to compensation unless Sunday was already reflected in the rate, which
 * many hospitality contracts do. So the app cannot derive this. Recording
 * "don't know" separately from "no" is what lets it later flag that an
 * entitlement might exist. See docs/PAY-RULES.md.
 */
export type SundayPremiumKind = 'none' | 'per_hour' | 'multiplier';

export type ShiftSource = 'manual';

export interface Settings {
  id: string;
  user_id: string;
  /** "My rate now" — the default copied onto new shifts, not what old shifts are worth. */
  hourly_rate_cents: number;
  breaks_paid: boolean;
  pay_period_length: PayPeriodLength;
  period_anchor_date: string;
  sunday_premium_kind: SundayPremiumKind | null;
  sunday_premium_cents_per_hour: number | null;
  /** Basis points; 10000 = 1.0x. Integer so a multiplier is never a float. */
  sunday_premium_basis_points: number | null;
  default_break_minutes: number;
}

export interface Shift {
  id: string;
  user_id: string;
  /** Dublin calendar day the shift belongs to. */
  work_date: string;
  planned_start_at: string;
  planned_end_at: string;
  /** Null until confirmed. Null is what makes a period total an estimate. */
  actual_end_at: string | null;
  planned_break_minutes: number;
  actual_break_minutes: number | null;
  actuals_confirmed_at: string | null;
  source: ShiftSource;
  /** The rate this shift was worked at, fixed when it was logged. */
  hourly_rate_cents: number;
}

/** A shift is settled once the user has confirmed what actually happened. */
export function isConfirmed(shift: Pick<Shift, 'actuals_confirmed_at'>): boolean {
  return shift.actuals_confirmed_at !== null;
}
