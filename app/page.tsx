import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getContributions,
  getGoal,
  getSettings,
  getShiftsBetween,
  getUnconfirmedShifts,
  periodContaining,
  weekDates,
} from '@/lib/db/queries';
import { aggregate, byDay, byWeek, provisionalNote } from '@/lib/pay/aggregate';
import { formatMinutes } from '@/lib/pay/calc';
import { formatCents, sumCents } from '@/lib/pay/money';
import { project } from '@/lib/pay/projection';
import {
  isFuture,
  isRangeKind,
  rangeContaining,
  rangeLabel,
  relativeLabel,
  stepRange,
} from '@/lib/pay/range';
import { dublinDate, formatDateRange } from '@/lib/time/dublin';
import { Card, EstimateNote, Money, Screen } from '@/app/_components/ui';
import {
  CalendarLegend,
  MonthCalendar,
  WeekStrip,
  YearGrids,
} from '@/app/_components/MonthCalendar';
import { RangeTabs } from '@/app/_components/RangeTabs';
import { Wordmark } from '@/app/_components/Wordmark';
import {
  ChartLegend,
  DayOfWeekBars,
  WeeklyBars,
  type Bar,
  type DayBar,
} from '@/app/_components/charts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_TICK = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' });

export default async function Dashboard(props: PageProps<'/'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const today = dublinDate();

  // The view is a URL, so it survives a refresh, can be shared, and the back
  // button steps through what you looked at. Month by default: it puts the
  // calendar — the densest, most glanceable thing here — in front of you.
  const kind = isRangeKind(params.range) ? params.range : 'month';
  const at = typeof params.at === 'string' && ISO_DATE.test(params.at) ? params.at : today;
  const range = rangeContaining(kind, at);
  const previous = stepRange(range, -1);
  const next = stepRange(range, 1);
  const ahead = isFuture(range, today);

  const [shifts, unconfirmed, goal, contributions] = await Promise.all([
    getShiftsBetween(range.from, range.to),
    getUnconfirmedShifts(),
    getGoal(),
    getContributions(),
  ]);

  const value = aggregate(shifts, settings);
  const days = byDay(shifts, settings);
  const peakCents = Math.max(0, ...[...days.values()].map((d) => d.cents));

  const weeks = [...byWeek(shifts, settings).entries()]
    .filter(([, w]) => w.shiftCount > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  const bestWeek = weeks.reduce((best, [, w]) => Math.max(best, w.cents), 0);
  const averageWeek = weeks.length
    ? Math.round(sumCents(weeks.map(([, w]) => w.cents)) / weeks.length)
    : 0;
  const weeksEstimated = weeks.some(([, w]) => w.estimated);

  const weekBars: Bar[] = weeks.map(([monday, w], i) => ({
    key: monday,
    label: `Week of ${monday}`,
    // Label only where the month changes; one tick per bar is unreadable here.
    tick:
      i === 0 || monday.slice(5, 7) !== weeks[i - 1][0].slice(5, 7)
        ? WEEK_TICK.format(new Date(`${monday}T00:00:00Z`))
        : '',
    confirmed: w.confirmedCents,
    estimated: w.estimatedCents,
  }));

  const dayOfWeekBars: DayBar[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(
    (label, index) => {
      const onThisDay = shifts.filter((s) => {
        const [yy, mm, dd] = s.work_date.split('-').map(Number);
        return (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7 === index;
      });
      return {
        key: label,
        label,
        confirmedMinutes: aggregate(
          onThisDay.filter((s) => s.actuals_confirmed_at !== null),
          settings,
        ).paidMinutes,
        estimatedMinutes: aggregate(
          onThisDay.filter((s) => s.actuals_confirmed_at === null),
          settings,
        ).paidMinutes,
      };
    },
  );

  // The pay period is a different question from the range being browsed —
  // it is what the employer pays against — so it keeps its own screen and its
  // own entry point rather than being folded into the range tabs.
  const payPeriod = periodContaining(today, settings);

  const saved = sumCents(contributions.map((c) => c.amount_cents));
  const projection = goal ? project(goal, contributions, today) : null;

  const [rYear, rMonth] = range.from.split('-').map(Number);

  return (
    <Screen>
      <header className="mb-4 flex items-center justify-between gap-2">
        <h1>
          <Wordmark />
        </h1>
        <Link
          href="/settings"
          className="t-caption min-h-9 px-1 pt-2 text-fg-secondary tabular-nums"
        >
          {formatCents(settings.hourly_rate_cents)}/hr
        </Link>
      </header>

      <RangeTabs active={kind} at={at} />

      <div className="mt-3 mb-2 flex items-center justify-between gap-2 px-1">
        <p className="t-label text-fg-secondary">{relativeLabel(range, today)}</p>
        <div className="flex items-center gap-1">
          <Step href={`/?range=${kind}&at=${previous.from}`} label={`Previous ${kind}`}>
            &lsaquo;
          </Step>
          <Step href={`/?range=${kind}&at=${next.from}`} label={`Next ${kind}`}>
            &rsaquo;
          </Step>
        </div>
      </div>

      {/* -- The number. -------------------------------------------------- */}
      <Card inverse className="px-6 py-6">
        <p className="t-caption opacity-70">
          {ahead
            ? `${relativeLabel(range, today)} will be worth about`
            : value.estimated
              ? `${relativeLabel(range, today)} is worth about`
              : `${relativeLabel(range, today)} is worth`}
        </p>
        <p className="mt-2">
          <Money cents={value.cents} estimated={value.estimated} size="hero" />
        </p>
        <p className="t-caption mt-2.5 opacity-70">
          {rangeLabel(range)}
          {value.shiftCount > 0 &&
            ` · ${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'} · ${formatMinutes(value.paidMinutes)}`}
        </p>
      </Card>

      {/* -- The nudge. Keeps every other number on this page honest. ------ */}
      {unconfirmed.length > 0 && (
        <Link href="/confirm" className="mt-3 block">
          <Card className="flex items-center justify-between gap-3 border border-attention-wash bg-attention-wash px-5 py-4 transition-transform duration-150 active:scale-[0.99]">
            <div>
              <p className="t-heading text-attention">
                {unconfirmed.length} shift{unconfirmed.length === 1 ? '' : 's'} to confirm
              </p>
              <p className="t-caption mt-0.5 text-fg-secondary">
                Worked, but not yet confirmed. Everything else here is provisional until
                they are.
              </p>
            </div>
            <span aria-hidden="true" className="t-figure text-attention">
              &rarr;
            </span>
          </Card>
        </Link>
      )}

      <Link
        href="/period"
        className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-surface-raised px-5 py-3.5 transition-transform duration-150 active:scale-[0.99]"
      >
        <span>
          <span className="t-label block text-fg-secondary">Pay period</span>
          <span className="t-caption text-fg-secondary tabular-nums">
            {formatDateRange(payPeriod.startsOn, payPeriod.endsOn)}
          </span>
        </span>
        <span aria-hidden="true" className="t-caption text-fg-secondary">
          &rarr;
        </span>
      </Link>

      {/* -- The calendar, in whichever shape the range asks for. ---------- */}
      <section className="mt-3">
        <Card className="px-3 py-4">
          {kind === 'week' && (
            <WeekStrip
              dates={weekDates(range.from)}
              days={days}
              today={today}
              peakCents={peakCents}
            />
          )}
          {kind === 'month' && (
            <MonthCalendar
              year={rYear}
              month={rMonth}
              days={days}
              today={today}
              peakCents={peakCents}
            />
          )}
          {kind === 'year' && (
            <YearGrids year={rYear} days={days} today={today} peakCents={peakCents} />
          )}
          <CalendarLegend />
        </Card>

        {provisionalNote(value) && (
          <div className="mt-2 px-1">
            <EstimateNote>{provisionalNote(value)}</EstimateNote>
          </div>
        )}
        <p className="t-caption mt-2 px-1 text-fg-secondary">
          {kind === 'year' ? 'Tap a month to open it.' : 'Tap any day to add a shift or fix one.'}
        </p>
      </section>

      {/* -- The s.14 flag. Only where it could actually apply. ----------- */}
      {value.sundayWithoutPremium && (
        <Card className="mt-3 px-5 py-4">
          <p className="t-heading">You worked a Sunday</p>
          <p className="t-caption mt-1 text-fg-secondary">
            No Sunday premium is recorded, so none has been added. Section 14 of the
            Organisation of Working Time Act 1997 entitles you to compensation for Sunday
            work unless it was already built into your rate &mdash; which many hospitality
            contracts do. Worth checking your contract.
          </p>
          <Link
            href="/settings"
            className="t-caption mt-2 inline-block text-attention underline"
          >
            Record a Sunday rate
          </Link>
        </Card>
      )}

      {/* -- Stats and charts, scoped to the selected range. --------------- */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">{rangeLabel(range)}</p>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Earned"
            cents={value.cents}
            estimated={value.estimated}
            note={`${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'}`}
          />
          <Stat
            label="Hours"
            text={value.paidMinutes === 0 ? '—' : formatMinutes(value.paidMinutes)}
            estimated={value.estimated}
            note={`over ${weeks.length} week${weeks.length === 1 ? '' : 's'}`}
          />
          <Stat
            label="Best week"
            cents={bestWeek}
            estimated={weeksEstimated}
            note={weeks.length === 0 ? 'no weeks yet' : 'highest in range'}
          />
          <Stat
            label="Average week"
            cents={averageWeek}
            estimated={weeksEstimated}
            note={weeks.length === 0 ? 'no weeks yet' : `over ${weeks.length}`}
          />
        </div>

        <div className="mt-2 space-y-2">
          <Card className="px-4 py-4">
            <p className="t-label text-fg-secondary">Earnings by week</p>
            <div className="mb-3 mt-1.5">
              <ChartLegend />
            </div>
            {weekBars.length === 0 ? (
              <p className="t-caption py-6 text-center text-fg-secondary">
                No shifts in this range.
              </p>
            ) : (
              <WeeklyBars bars={weekBars} caption={`Earnings by week, ${rangeLabel(range)}.`} />
            )}
          </Card>

          <Card className="px-4 py-4">
            <p className="t-label text-fg-secondary">Hours by day of week</p>
            <div className="mb-3 mt-1.5">
              <ChartLegend />
            </div>
            <DayOfWeekBars days={dayOfWeekBars} />
          </Card>
        </div>
      </section>

      {/* -- Savings goal. ------------------------------------------------- */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">Savings goal</p>
        <Link href="/goal" className="block">
          <Card className="px-5 py-5 transition-transform duration-150 active:scale-[0.99]">
            {goal && projection ? (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="t-heading">{goal.name}</p>
                  <span aria-hidden="true" className="t-caption text-fg-secondary">
                    &rarr;
                  </span>
                </div>
                <p className="mt-1.5 flex items-baseline gap-1.5">
                  <Money cents={saved} estimated={false} size="display" />
                  <span className="t-caption text-fg-secondary">
                    of {formatCents(goal.target_cents)}
                  </span>
                </p>
                <div
                  className="mt-3 h-2 w-full overflow-hidden rounded-full bg-segment-track"
                  role="img"
                  aria-label={`${Math.round(projection.progress * 100)} percent of target`}
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{
                      width: `${Math.max(projection.progress * 100, saved > 0 ? 2 : 0)}%`,
                    }}
                  />
                </div>
                <p className="t-caption mt-2.5 text-fg-secondary">
                  {projection.reached
                    ? 'Target reached.'
                    : (projection.reason ??
                      `On track for ${projection.projectedDate} — about ${projection.weeksRemaining} more week${projection.weeksRemaining === 1 ? '' : 's'} at ${formatCents(projection.perWeekCents!)} a week.`)}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="t-heading">Set a goal</p>
                  <span aria-hidden="true" className="t-caption text-fg-secondary">
                    &rarr;
                  </span>
                </div>
                <p className="t-caption mt-1 text-fg-secondary">
                  Pick a target and record what you actually put aside. Earnings are already
                  tracked &mdash; this is what survives.
                </p>
              </>
            )}
          </Card>
        </Link>
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
          <span className={`t-figure ${estimated ? 'is-estimated' : 'is-confirmed'}`}>{text}</span>
        )}
      </p>
      {note && <p className="t-caption mt-0.5 text-fg-tertiary">{note}</p>}
    </Card>
  );
}

function Step({
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
      className="t-figure flex size-8 items-center justify-center rounded-md text-fg-secondary transition-[background-color,transform] duration-150 active:scale-90 active:bg-segment-track"
    >
      {children}
    </Link>
  );
}
