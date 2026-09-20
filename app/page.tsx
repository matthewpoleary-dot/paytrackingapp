import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getContributions,
  getGoal,
  getSettings,
  getShiftsBetween,
  getShiftsSince,
  getUnconfirmedShifts,
  periodContaining,
} from '@/lib/db/queries';
import { aggregate, byDay, byWeek, provisionalNote } from '@/lib/pay/aggregate';
import { formatMinutes } from '@/lib/pay/calc';
import { formatCents, sumCents } from '@/lib/pay/money';
import { dublinDate, formatDateRange } from '@/lib/time/dublin';
import {
  Card,
  EstimateNote,
  Money,
  Screen,
} from '@/app/_components/ui';
import { CalendarLegend, MonthCalendar } from '@/app/_components/MonthCalendar';

const MONTH_NAME = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'long' });
const ISO_MONTH = /^\d{4}-\d{2}$/;

export default async function Dashboard(props: PageProps<'/'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const today = dublinDate();

  // Which month the calendar is showing. A parameter, so every month is
  // reachable — the v1 lesson about data you can save but never see again.
  const viewMonth =
    typeof params.month === 'string' && ISO_MONTH.test(params.month)
      ? params.month
      : today.slice(0, 7);
  const [vYear, vMonth] = viewMonth.split('-').map(Number);
  const monthStart = `${viewMonth}-01`;
  const monthEnd = `${viewMonth}-${String(new Date(Date.UTC(vYear, vMonth, 0)).getUTCDate()).padStart(2, '0')}`;

  const period = periodContaining(today, settings);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [periodShifts, monthShifts, yearShifts, unconfirmed, goal, contributions] =
    await Promise.all([
      getShiftsBetween(period.startsOn, period.endsOn),
      getShiftsBetween(monthStart, monthEnd),
      getShiftsSince(yearStart),
      getUnconfirmedShifts(),
      getGoal(),
      getContributions(),
    ]);

  const periodValue = aggregate(periodShifts, settings);
  const monthValue = aggregate(monthShifts, settings);
  const yearValue = aggregate(yearShifts, settings);

  const days = byDay(monthShifts, settings);
  const peakCents = Math.max(0, ...[...days.values()].map((d) => d.cents));

  const weeks = [...byWeek(yearShifts, settings).values()].filter((w) => w.shiftCount > 0);
  const bestWeek = weeks.reduce<number>((best, w) => Math.max(best, w.cents), 0);
  const averageWeek = weeks.length
    ? Math.round(sumCents(weeks.map((w) => w.cents)) / weeks.length)
    : 0;
  const weeksEstimated = weeks.some((w) => w.estimated);

  const saved = sumCents(contributions.map((c) => c.amount_cents));

  const prevMonth = shiftMonth(viewMonth, -1);
  const nextMonth = shiftMonth(viewMonth, 1);

  return (
    <Screen>
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h1 className="t-title">Pay</h1>
        <Link href="/settings" className="t-caption min-h-9 px-1 pt-2 text-fg-secondary tabular-nums">
          {formatCents(settings.hourly_rate_cents)}/hr
        </Link>
      </header>

      {/* -- 1. This period. Still the headline. --------------------------- */}
      <Link href="/period" className="block">
        <Card inverse className="px-6 py-6">
          <div className="flex items-baseline justify-between gap-2">
            <p className="t-caption opacity-70">
              {periodValue.estimated ? 'This period is worth about' : 'This period is worth'}
            </p>
            <span aria-hidden="true" className="t-caption opacity-60">
              &rarr;
            </span>
          </div>
          <p className="mt-2">
            <Money cents={periodValue.cents} estimated={periodValue.estimated} size="hero" />
          </p>
          <p className="t-caption mt-2.5 opacity-70">
            {formatDateRange(period.startsOn, period.endsOn)}
            {periodValue.shiftCount > 0 &&
              ` · ${periodValue.shiftCount} shift${periodValue.shiftCount === 1 ? '' : 's'} · ${formatMinutes(periodValue.paidMinutes)}`}
          </p>
        </Card>
      </Link>

      {/* -- 2. The nudge. Keeps every other number on this page honest. --- */}
      {unconfirmed.length > 0 && (
        <Link href="/confirm" className="mt-3 block">
          <Card className="flex items-center justify-between gap-3 border border-attention-wash bg-attention-wash px-5 py-4">
            <div>
              <p className="t-heading text-attention">
                {unconfirmed.length} shift{unconfirmed.length === 1 ? '' : 's'} to confirm
              </p>
              <p className="t-caption mt-0.5 text-fg-secondary">
                Worked, but not yet confirmed. Everything else on this page is provisional until they are.
              </p>
            </div>
            <span aria-hidden="true" className="t-figure text-attention">
              &rarr;
            </span>
          </Card>
        </Link>
      )}

      {/* -- 3. The month. ------------------------------------------------- */}
      <section className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <p className="t-label text-fg-secondary">
            {MONTH_NAME.format(new Date(Date.UTC(vYear, vMonth - 1, 1)))} {vYear}
          </p>
          <div className="flex items-center gap-1">
            <MonthStep href={`/?month=${prevMonth}`} label="Previous month">
              &lsaquo;
            </MonthStep>
            <MonthStep href={`/?month=${nextMonth}`} label="Next month">
              &rsaquo;
            </MonthStep>
          </div>
        </div>

        <Card className="px-3 py-4">
          <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
            <Money
              cents={monthValue.cents}
              estimated={monthValue.estimated}
              size="display"
            />
            <p className="t-caption text-fg-secondary">
              {monthValue.shiftCount === 0
                ? 'No shifts'
                : `${monthValue.shiftCount} shift${monthValue.shiftCount === 1 ? '' : 's'} · ${formatMinutes(monthValue.paidMinutes)}`}
            </p>
          </div>

          <MonthCalendar
            year={vYear}
            month={vMonth}
            days={days}
            today={today}
            peakCents={peakCents}
          />
          <CalendarLegend />
        </Card>

        {provisionalNote(monthValue) && (
          <div className="mt-2 px-1">
            <EstimateNote>{provisionalNote(monthValue)}</EstimateNote>
          </div>
        )}
        <p className="t-caption mt-2 px-1 text-fg-secondary">
          Tap any day to add a shift or fix one.
        </p>
      </section>

      {/* -- 4. Long term. Stat tiles now; the charts land next. ----------- */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">
          {today.slice(0, 4)} so far
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Earned this year"
            cents={yearValue.cents}
            estimated={yearValue.estimated}
            note={`${yearValue.shiftCount} shift${yearValue.shiftCount === 1 ? '' : 's'}`}
          />
          <Stat
            label="Hours this year"
            text={formatMinutes(yearValue.paidMinutes)}
            estimated={yearValue.estimated}
            note={`across ${weeks.length} week${weeks.length === 1 ? '' : 's'}`}
          />
          <Stat
            label="Best week"
            cents={bestWeek}
            estimated={weeksEstimated}
            note={weeks.length === 0 ? 'no weeks yet' : 'highest so far'}
          />
          <Stat
            label="Average week"
            cents={averageWeek}
            estimated={weeksEstimated}
            note={weeks.length === 0 ? 'no weeks yet' : `over ${weeks.length}`}
          />
        </div>
        <div className="mt-2">
          <Card className="px-5 py-6 text-center">
            <p className="t-caption text-fg-secondary">
              Earnings over time and hours by day of week land here next.
            </p>
          </Card>
        </div>
      </section>

      {/* -- 5. Savings goal. ---------------------------------------------- */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">Savings goal</p>
        <Card className="px-5 py-5">
          {goal ? (
            <>
              <p className="t-heading">{goal.name}</p>
              <p className="mt-1.5">
                <Money cents={saved} estimated={false} size="display" />
                <span className="t-caption text-fg-secondary">
                  {' of '}
                  {formatCents(goal.target_cents)}
                </span>
              </p>
            </>
          ) : (
            <p className="t-caption text-fg-secondary">
              Set a target and record what you actually put aside. Earnings are already
              known &mdash; this tracks what survives.
            </p>
          )}
        </Card>
      </section>

      <div className="h-8" />
    </Screen>
  );
}

function Stat({
  label,
  cents,
  text,
  estimated,
  note,
}: {
  label: string;
  cents?: number;
  text?: string;
  estimated: boolean;
  note?: string;
}) {
  return (
    <Card className="px-4 py-4">
      <p className="t-label text-fg-secondary">{label}</p>
      <p className="mt-1.5">
        {cents !== undefined ? (
          <Money cents={cents} estimated={estimated} size="figure" />
        ) : (
          <span className={`t-figure ${estimated ? 'is-estimated' : 'is-confirmed'}`}>
            {text}
          </span>
        )}
      </p>
      {note && <p className="t-caption mt-0.5 text-fg-tertiary">{note}</p>}
    </Card>
  );
}

function MonthStep({
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
      className="t-figure flex size-8 items-center justify-center rounded-md text-fg-secondary transition-colors duration-150 active:bg-segment-track"
    >
      {children}
    </Link>
  );
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
