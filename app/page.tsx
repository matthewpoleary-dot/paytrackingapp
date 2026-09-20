import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getSettings,
  getShiftsBetween,
  getUnconfirmedShifts,
  periodContaining,
} from '@/lib/db/queries';
import { formatMinutes, valuePeriod } from '@/lib/pay/calc';
import { formatCents } from '@/lib/pay/money';
import {
  dublinDate,
  formatDateRange,
  formatDublinTime,
  formatWorkDate,
  isSundayWorkDate,
} from '@/lib/time/dublin';
import {
  Card,
  Empty,
  EstimateNote,
  Group,
  GroupRow,
  Money,
  PrimaryLink,
  Screen,
  SecondaryLink,
} from '@/app/_components/ui';

export default async function ThisPeriod() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const today = dublinDate();
  const period = periodContaining(today, settings);

  const [shifts, unconfirmed] = await Promise.all([
    getShiftsBetween(period.startsOn, period.endsOn),
    getUnconfirmedShifts(),
  ]);

  const value = valuePeriod(shifts, settings);
  const byId = new Map(value.byShift.map((v) => [v.shiftId, v]));

  return (
    <Screen>
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="t-label text-fg-secondary">This period</p>
          <h1 className="t-heading mt-1">
            {formatDateRange(period.startsOn, period.endsOn)}
          </h1>
        </div>
        <Link href="/setup?edit=1" className="t-caption min-h-9 px-1 pt-2 text-fg-secondary">
          {formatCents(settings.hourly_rate_cents)}/hr
        </Link>
      </header>

      {/* -- The number. The whole point of the screen. ------------------- */}
      <Card inverse className="px-6 py-7">
        <p className="t-caption opacity-70">
          {value.estimated ? 'This period is worth about' : 'This period is worth'}
        </p>
        <p className="mt-2">
          <Money cents={value.cents} estimated={value.estimated} size="hero" />
        </p>
        <p className="t-caption mt-3 opacity-70">
          {value.shiftCount === 0
            ? 'No shifts logged yet'
            : `${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'} · ${formatMinutes(value.paidMinutes)} paid`}
        </p>
      </Card>

      {/* -- Why it is still a guess, and what to do about it. ------------ */}
      {unconfirmed.length > 0 && (
        <Link href="/confirm" className="mt-3 block">
          <Card className="flex items-center justify-between gap-3 border border-attention-wash bg-attention-wash px-5 py-4">
            <div>
              <p className="t-heading text-attention">
                {unconfirmed.length} shift{unconfirmed.length === 1 ? '' : 's'} to confirm
              </p>
              <p className="t-caption mt-0.5 text-fg-secondary">
                Until then this is an estimate, not a figure you could stand over.
              </p>
            </div>
            <span aria-hidden="true" className="t-figure text-attention">
              &rarr;
            </span>
          </Card>
        </Link>
      )}

      {/* -- The s.14 flag. Only where it could actually apply. ----------- */}
      {value.sundayWithoutPremium && (
        <Card className="mt-3 px-5 py-4">
          <p className="t-heading">You worked a Sunday</p>
          <p className="t-caption mt-1 text-fg-secondary">
            No Sunday premium is recorded, so none has been added. Section 14 of the
            Organisation of Working Time Act 1997 entitles you to compensation for
            Sunday work unless it was already built into your rate &mdash; which many
            hospitality contracts do. Worth checking your contract.
          </p>
          <Link href="/setup?edit=1" className="t-caption mt-2 inline-block text-attention underline">
            Record a Sunday rate
          </Link>
        </Card>
      )}

      {/* -- The shifts themselves. --------------------------------------- */}
      <div className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">Shifts</p>
        {shifts.length === 0 ? (
          <Empty title="Nothing logged for this period">
            Add the week&rsquo;s roster in one sitting and the total above fills itself in.
          </Empty>
        ) : (
          <Card>
            <Group>
              {shifts.map((shift) => {
                const v = byId.get(shift.id)!;
                const end = shift.actual_end_at ?? shift.planned_end_at;
                return (
                  <GroupRow key={shift.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="t-heading">
                        {formatWorkDate(shift.work_date)}
                        {isSundayWorkDate(shift.work_date) && (
                          <span className="t-label ml-2 align-middle text-fg-tertiary">Sun</span>
                        )}
                      </p>
                      <p className="t-caption mt-0.5 text-fg-secondary tabular-nums">
                        {formatDublinTime(shift.planned_start_at)}&ndash;
                        {formatDublinTime(end)}
                        <span className="text-fg-tertiary">
                          {' · '}
                          {formatMinutes(v.paidMinutes)}
                        </span>
                      </p>
                    </div>
                    <Money cents={v.cents} estimated={v.estimated} />
                  </GroupRow>
                );
              })}
            </Group>
          </Card>
        )}
      </div>

      {value.estimated && shifts.length > 0 && (
        <div className="mt-3 px-1">
          <EstimateNote>
            Figures marked ~ assume you finished when rostered and took your break.
          </EstimateNote>
        </div>
      )}

      <div className="mt-auto space-y-2 pt-8">
        <PrimaryLink href="/roster">Add next week&rsquo;s shifts</PrimaryLink>
        {unconfirmed.length === 0 && shifts.length > 0 && (
          <SecondaryLink href="/roster?week=this">Add a shift to this week</SecondaryLink>
        )}
      </div>
    </Screen>
  );
}
