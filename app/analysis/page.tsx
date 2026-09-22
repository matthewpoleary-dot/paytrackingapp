import { redirect } from 'next/navigation';
import { getSettings, getShiftsBetween } from '@/lib/db/queries';
import { aggregate, byDay, byWeek } from '@/lib/pay/aggregate';
import { formatMinutes } from '@/lib/pay/calc';
import { sumCents } from '@/lib/pay/money';
import { isRangeKind, rangeContaining, rangeLabel } from '@/lib/pay/range';
import { dublinDate } from '@/lib/time/dublin';
import { Money, PageHeader, Screen } from '@/app/_components/ui';
import { TabBar } from '@/app/_components/TabBar';
import { CalendarLegend, MonthCalendar } from '@/app/_components/MonthCalendar';
import {
  ChartLegend,
  DayOfWeekBars,
  WeeklyBars,
  type Bar,
  type DayBar,
} from '@/app/_components/charts';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WEEK_TICK = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' });
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Analysis.
 *
 * Everything here answers "what does the pattern look like", which is a
 * different question from "what is this worth" and belongs behind a tap
 * rather than below the fold of the screen that answers the first one.
 *
 * It inherits the range from wherever it was opened, so the dashboard's
 * Week/Month/Year choice carries through instead of resetting.
 */
export default async function Analysis(props: PageProps<'/analysis'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const today = dublinDate();
  const kind = isRangeKind(params.range) ? params.range : 'month';
  const at = typeof params.at === 'string' && ISO_DATE.test(params.at) ? params.at : today;
  const range = rangeContaining(kind, at);

  const shifts = await getShiftsBetween(range.from, range.to);
  const value = aggregate(shifts, settings);
  const days = byDay(shifts, settings);
  const peakCents = Math.max(0, ...[...days.values()].map((d) => d.cents));
  const [rYear, rMonth] = range.from.split('-').map(Number);

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

  const dayOfWeekBars: DayBar[] = WEEKDAYS.map((label, index) => {
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
  });

  const view = `range=${kind}&at=${range.from}`;

  return (
    <Screen>
      <PageHeader title={rangeLabel(range)} back={{ href: `/?${view}`, label: 'Shifts' }} />

      {value.shiftCount === 0 ? (
        <p className="t-body text-fg-secondary">
          No shifts in this range, so there is no pattern to read yet. Log a week and this
          fills in.
        </p>
      ) : (
        <>
          {/* Four readings of the same range, tight together because they are
              one group — the air goes between groups, not inside them. */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5">
            <Stat
              label="Earned"
              cents={value.cents}
              estimated={value.estimated}
              note={`${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'}`}
            />
            <Stat
              label="Hours"
              text={formatMinutes(value.paidMinutes)}
              estimated={value.estimated}
              note={`over ${weeks.length} week${weeks.length === 1 ? '' : 's'}`}
            />
            <Stat
              label="Best week"
              cents={bestWeek}
              estimated={weeksEstimated}
              note="highest in range"
            />
            <Stat
              label="Average week"
              cents={averageWeek}
              estimated={weeksEstimated}
              note={`over ${weeks.length}`}
            />
          </dl>

          {/* The month grid lives here rather than on the dashboard. Seeing
              the shape of a month is this screen's job; the dashboard asks a
              different question and a grid of empty cells was a poor answer
              to it. */}
          {kind === 'month' && (
            <section className="mt-12">
              <h2 className="t-heading">The month</h2>
              <div className="mt-4">
                <MonthCalendar
                  year={rYear}
                  month={rMonth}
                  days={days}
                  today={today}
                  peakCents={peakCents}
                />
                <div className="mt-4">
                  <CalendarLegend showIntensity showEstimated={value.unconfirmedCount > 0} />
                </div>
              </div>
            </section>
          )}

          <section className="mt-12">
            <h2 className="t-heading">Earnings by week</h2>
            <div className="mt-2">
              <ChartLegend />
            </div>
            <div className="mt-4">
              <WeeklyBars bars={weekBars} caption={`Earnings by week, ${rangeLabel(range)}.`} />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="t-heading">Hours by day of week</h2>
            <div className="mt-2">
              <ChartLegend />
            </div>
            <div className="mt-4">
              <DayOfWeekBars days={dayOfWeekBars} />
            </div>
          </section>
        </>
      )}

      <TabBar active="shifts" />
    </Screen>
  );
}

/** A reading, on the page field. Not a card — four cards is a dashboard. */
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
  note: string;
}) {
  return (
    <div>
      <dt className="t-label text-fg-secondary">{label}</dt>
      <dd className="mt-1.5">
        {cents !== undefined ? (
          <Money cents={cents} estimated={estimated} size="figure" />
        ) : (
          <span className={`t-figure ${estimated ? 'is-estimated' : 'is-confirmed'}`}>
            {text}
          </span>
        )}
        <span className="t-caption mt-0.5 block text-fg-tertiary">{note}</span>
      </dd>
    </div>
  );
}
