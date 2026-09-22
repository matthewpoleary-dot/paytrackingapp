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
import { aggregate, byDay } from '@/lib/pay/aggregate';
import { formatMinutes } from '@/lib/pay/calc';
import { formatCents, sumCents } from '@/lib/pay/money';
import { project } from '@/lib/pay/projection';
import {
  isFuture,
  isRangeKind,
  rangeContaining,
  monthDates,
  rangeLabel,
  relativeLabel,
  stepRange,
} from '@/lib/pay/range';
import { dublinDate, formatDateRange } from '@/lib/time/dublin';
import { Card, Chevron, Group, Money, NavRow, Screen } from '@/app/_components/ui';
import {
  CalendarLegend,
  DateStrip,
  YearGrids,
} from '@/app/_components/MonthCalendar';
import { RangeTabs } from '@/app/_components/RangeTabs';
import { Wordmark } from '@/app/_components/Wordmark';
import { TabBar } from '@/app/_components/TabBar';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The dashboard.
 *
 * One question, asked once: what is this range worth, and which days made it.
 * The figure and the days are a single unit inside a single hairline region
 * because they are a single thought — splitting them into two filled cards of
 * equal weight was what left the screen with no reading order and the same
 * money printed four times under three headings.
 *
 * The days are a strip rather than a grid. A part-timer works three or four
 * days a week, so a month grid spends most of its area proving that nothing
 * happened; the month view of the log lives on /analysis, where looking at
 * shape is the actual job.
 *
 * Everything that analyses rather than answers lives there too. Everything
 * that navigates lives in one group at the foot of the page. What is left
 * between them is the range, the number, the days, and the one thing to do
 * next.
 */
export default async function Dashboard(props: PageProps<'/'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const today = dublinDate();

  // The view is a URL, so it survives a refresh, can be shared, and the back
  // button steps through what you looked at.
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
  const empty = value.shiftCount === 0;

  const payPeriod = periodContaining(today, settings);
  const saved = sumCents(contributions.map((c) => c.amount_cents));
  const projection = goal ? project(goal, contributions, today) : null;

  const [rYear, rMonth] = range.from.split('-').map(Number);
  const view = `range=${kind}&at=${range.from}`;

  return (
    <Screen>
      <header className="mb-5 flex items-center justify-between gap-2">
        <h1>
          <Wordmark />
        </h1>
        <Link
          href="/settings"
          className="t-caption -mr-2 flex min-h-11 items-center px-2 text-fg-secondary tabular-nums"
        >
          {formatCents(settings.hourly_rate_cents)}/hr
        </Link>
      </header>

      <RangeTabs active={kind} at={at} />

      {/* -- The unit: what this range is worth, and the days that made it. --
          One region, one figure, stated once. A hairline rather than a fill:
          on a map sheet nothing is a filled block, and the figure dominates
          by size and space instead of by sitting on a slab. The days are the
          same number spread out, not evidence for it. */}
      <section className="mt-3 rounded-2xl border border-border px-5 pb-5 pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="t-label text-fg-secondary">{relativeLabel(range, today)}</p>
          <div className="-mr-2 flex items-center">
            <Step href={`/?range=${kind}&at=${previous.from}`} label={`Previous ${kind}`}>
              <Chevron direction="left" />
            </Step>
            <Step href={`/?range=${kind}&at=${next.from}`} label={`Next ${kind}`}>
              <Chevron />
            </Step>
          </div>
        </div>

        {empty ? (
          <p className="t-title mt-3 text-fg-secondary">
            {ahead ? 'Nothing rostered yet' : 'Nothing logged'}
          </p>
        ) : (
          <>
            <p className="t-caption mt-3 text-fg-secondary">
              {ahead ? 'will be worth about' : value.estimated ? 'is worth about' : 'is worth'}
            </p>
            <p className="mt-1.5">
              <Money cents={value.cents} estimated={value.estimated} size="hero" />
            </p>
            <p className="t-caption mt-2 text-fg-secondary tabular-nums">
              {value.shiftCount} shift{value.shiftCount === 1 ? '' : 's'} &middot;{' '}
              {formatMinutes(value.paidMinutes)}
            </p>
          </>
        )}

        <hr className="my-5 border-0 border-t border-separator" />

        {/* A strip for days, the year grid for months. The strip is the whole
            reason the old month grid is gone — it holds the same information
            in a band instead of a field of empty cells. */}
        {kind === 'year' ? (
          <YearGrids year={rYear} days={days} today={today} peakCents={peakCents} />
        ) : (
          <DateStrip
            dates={kind === 'week' ? weekDates(range.from) : monthDates(rYear, rMonth)}
            days={days}
            today={today}
            peakCents={peakCents}
          />
        )}

        {/* Each half appears only where it has something to explain. */}
        {(!empty || value.unconfirmedCount > 0) && (
          <div className="mt-4">
            <CalendarLegend
              showIntensity={!empty}
              showEstimated={value.unconfirmedCount > 0}
            />
          </div>
        )}
      </section>

      <p className="t-caption mt-2.5 px-1 text-fg-secondary">
        {kind === 'year'
          ? 'Tap a month to open it.'
          : empty
            ? 'Tap any day to log a shift.'
            : 'Tap any day to add a shift or fix one.'}
      </p>

      {/* -- The one thing to do next. ------------------------------------ */}
      <div className="mt-5">
        <NextStep unconfirmedCount={unconfirmed.length} empty={empty} />
      </div>

      {/* -- The s.14 flag. A plain section: it is a note, not a tile. ----- */}
      {value.sundayWithoutPremium && (
        <section className="mt-8 px-1">
          <h2 className="t-heading">You worked a Sunday</h2>
          <p className="t-caption mt-1.5 text-fg-secondary">
            No Sunday premium is recorded, so none has been added. Section 14 of the
            Organisation of Working Time Act 1997 entitles you to compensation for Sunday
            work unless it was already built into your rate &mdash; which many hospitality
            contracts do. Worth checking your contract.
          </p>
          <Link
            href="/settings"
            className="t-caption mt-2 inline-flex min-h-11 items-center text-attention underline"
          >
            Record a Sunday rate
          </Link>
        </section>
      )}

      {/* -- Everything else this screen can reach. -----------------------
          One group, one chevron, one optical margin. Values are details, not
          figures: no row here restates money the page has already stated. */}
      <nav aria-label="More" className="mt-10">
        <Card>
          <Group>
            <NavRow
              href="/period"
              label="Pay period"
              value={formatDateRange(payPeriod.startsOn, payPeriod.endsOn)}
            />
            <NavRow
              href="/goal"
              label="Savings goal"
              value={
                goal && projection
                  ? projection.reached
                    ? 'Reached'
                    : `${Math.round(projection.progress * 100)}% of ${formatCents(goal.target_cents)}`
                  : 'Not set'
              }
            />
            <NavRow
              href={`/analysis?${view}`}
              label="Analysis"
              value={empty ? 'No shifts yet' : rangeLabel(range)}
            />
          </Group>
        </Card>
      </nav>

      {saved > 0 && goal && (
        <p className="sr-only">
          {formatCents(saved)} saved of {formatCents(goal.target_cents)}.
        </p>
      )}

      <TabBar active="shifts" />
    </Screen>
  );
}

/**
 * The primary action, which is never absent.
 *
 * A screen with no next step is a screen you close. Which step it is depends
 * on where the week actually is: confirming what was worked outranks adding
 * more, because every other figure on the page stays provisional until it is
 * done.
 */
function NextStep({
  unconfirmedCount,
  empty,
}: {
  unconfirmedCount: number;
  empty: boolean;
}) {
  if (unconfirmedCount > 0) {
    return (
      <Link
        href="/confirm"
        className="flex min-h-[3.75rem] items-center gap-3 rounded-xl border border-attention/35 bg-attention-wash px-5 py-3.5 transition-transform duration-150 active:scale-[0.99]"
      >
        <span className="flex-1">
          <span className="t-heading block text-attention">
            Confirm {unconfirmedCount} shift{unconfirmedCount === 1 ? '' : 's'}
          </span>
          <span className="t-caption text-fg-secondary">
            Every figure here is provisional until you do.
          </span>
        </span>
        <Chevron className="t-figure text-attention" />
      </Link>
    );
  }

  return (
    <Link
      href="/roster"
      className="flex min-h-[3.75rem] items-center gap-3 rounded-xl bg-accent px-5 py-3.5 text-accent-fg transition-transform duration-150 active:scale-[0.99]"
    >
      <span className="t-heading flex-1">
        {empty ? 'Log your first shifts' : 'Enter next week’s roster'}
      </span>
      <Chevron className="t-figure" />
    </Link>
  );
}

/** A step through the range. 44px, because a 32px target is not one. */
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
      className="t-figure flex size-11 items-center justify-center rounded-lg text-fg-secondary transition-[background-color,transform] duration-150 active:scale-90 active:bg-accent-wash"
    >
      {children}
    </Link>
  );
}
