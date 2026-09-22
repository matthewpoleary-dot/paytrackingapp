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
import { nextPeriodStart } from '@/lib/pay/period';
import {
  addDays,
  dublinDate,
  formatDateRange,
  formatDublinTime,
  formatWorkDate,
  isSundayWorkDate,
} from '@/lib/time/dublin';
import {
  Card,
  Chevron,
  Empty,
  EstimateNote,
  Group,
  GroupRow,
  Money,
  PrimaryLink,
  Screen,
  SecondaryLink,
} from '@/app/_components/ui';
import { SundayNotice } from '@/app/_components/SundayNotice';

export default async function ThisPeriod(props: PageProps<'/period'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const today = dublinDate();
  const current = periodContaining(today, settings);

  // Which period is being looked at. Defaults to the one containing today, but
  // every period is reachable — without this, shifts logged for next week save
  // correctly and then appear nowhere, which reads as the app losing them.
  const requested = typeof params.period === 'string' ? params.period : undefined;
  const period = requested ? periodContaining(requested, settings) : current;

  const previous = periodContaining(addDays(period.startsOn, -1), settings);
  const next = periodContaining(
    nextPeriodStart(period.startsOn, settings.pay_period_length),
    settings,
  );

  const isCurrent = period.startsOn === current.startsOn;
  const isFuture = period.startsOn > current.startsOn;
  const label = isCurrent
    ? 'This period'
    : isFuture
      ? period.startsOn === next.startsOn || previous.startsOn === current.startsOn
        ? 'Next period'
        : 'Ahead'
      : previous.startsOn === period.startsOn || period.endsOn < today
        ? 'Earlier period'
        : 'Last period';

  const [shifts, unconfirmed] = await Promise.all([
    getShiftsBetween(period.startsOn, period.endsOn),
    getUnconfirmedShifts(),
  ]);

  const value = valuePeriod(shifts, settings);
  const byId = new Map(value.byShift.map((v) => [v.shiftId, v]));

  const worthLabel = isFuture
    ? 'This period will be worth about'
    : value.estimated
      ? 'This period is worth about'
      : 'This period is worth';

  return (
    <Screen>
      <header className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="t-label text-fg-secondary">{label}</p>
          <div className="mt-1 flex items-center gap-1">
            <PeriodStep href={`/period?period=${previous.startsOn}`} label="Previous period">
              <Chevron direction="left" />
            </PeriodStep>
            <h1 className="t-heading whitespace-nowrap tabular-nums">
              {formatDateRange(period.startsOn, period.endsOn)}
            </h1>
            <PeriodStep href={`/period?period=${next.startsOn}`} label="Next period">
              <Chevron />
            </PeriodStep>
          </div>
        </div>
        <Link
          href="/settings"
          className="t-caption -mr-2 inline-flex min-h-11 shrink-0 items-center px-2 text-fg-secondary tabular-nums"
        >
          {formatCents(settings.hourly_rate_cents)}/hr
        </Link>
      </header>

      {!isCurrent && (
        <Link href="/period" className="t-caption mb-3 inline-flex min-h-11 items-center underline">
          Back to this period
        </Link>
      )}

      {/* -- The number. The whole point of the screen. ------------------- */}
      <Card className="px-6 py-7">
        <p className="t-caption text-fg-secondary">{worthLabel}</p>
        <p className="mt-2">
          <Money cents={value.cents} estimated={value.estimated} size="hero" />
        </p>
        <p className="t-caption mt-3 text-fg-secondary">
          {value.shiftCount === 0
            ? 'No shifts logged yet'
            : `${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'} · ${formatMinutes(value.paidMinutes)} paid`}
        </p>
      </Card>

      {/* -- Why it is still a guess, and what to do about it. ------------ */}
      {unconfirmed.length > 0 && (
        <Link href="/confirm" className="mt-3 block">
          {/* The one card in the app that keeps a fill: the fill IS the
              signal. Everything around it is a hairline now, so this reads
              louder than it did when every card was filled. */}
          <Card className="flex items-center justify-between gap-3 border-attention/35 bg-attention-wash px-5 py-4">
            <div>
              <p className="t-heading text-attention">
                {unconfirmed.length} shift{unconfirmed.length === 1 ? '' : 's'} to confirm
              </p>
              <p className="t-caption mt-0.5 text-fg-secondary">
                Until then this is an estimate, not a figure you could stand over.
              </p>
            </div>
            <Chevron className="t-figure text-attention" />
          </Card>
        </Link>
      )}

      {value.sundayWithoutPremium && (
        <div className="mt-6">
          <SundayNotice />
        </div>
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
            {isFuture
              ? 'Nothing here has been worked yet, so every figure is a plan.'
              : 'Figures marked ~ assume you finished when rostered and took your break.'}
          </EstimateNote>
        </div>
      )}

      <div className="mt-auto space-y-2 pt-8">
        <PrimaryLink href={isFuture ? `/roster?start=${period.startsOn}` : '/roster'}>
          {isFuture ? 'Add more shifts here' : 'Add next week’s shifts'}
        </PrimaryLink>
        {isCurrent && (
          <SecondaryLink href="/roster?week=this">
            Add a shift to this week
          </SecondaryLink>
        )}
      </div>
    </Screen>
  );
}

function PeriodStep({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="t-figure -my-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-fg-secondary transition-colors duration-150 active:bg-segment-track"
    >
      {children}
    </Link>
  );
}
