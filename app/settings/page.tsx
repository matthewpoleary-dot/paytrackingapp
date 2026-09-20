import { redirect } from 'next/navigation';
import { getSettings } from '@/lib/db/queries';
import { SettingsForm, type SettingsInitial } from './SettingsForm';

export default async function SettingsPage() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const initial: SettingsInitial = {
    rate: (settings.hourly_rate_cents / 100).toFixed(2),
    rateCents: settings.hourly_rate_cents,
    breaks: settings.breaks_paid ? 'paid' : 'unpaid',
    period: settings.pay_period_length,
    // NULL means "not sure" and is not the same as 'none'.
    sunday:
      settings.sunday_premium_kind === null
        ? 'unknown'
        : settings.sunday_premium_kind === 'none'
          ? 'none'
          : 'yes',
    sundayShape: settings.sunday_premium_kind === 'multiplier' ? 'multiplier' : 'per_hour',
    sundayValue:
      settings.sunday_premium_kind === 'multiplier'
        ? String((settings.sunday_premium_basis_points ?? 10_000) / 10_000)
        : settings.sunday_premium_cents_per_hour !== null
          ? (settings.sunday_premium_cents_per_hour / 100).toFixed(2)
          : '',
  };

  return <SettingsForm initial={initial} />;
}
