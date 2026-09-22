import Link from 'next/link';
import { formatCents } from '@/lib/pay/money';
import type { DayValue } from '@/lib/pay/aggregate';
import { StripScroll } from '@/app/_components/StripScroll';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Monday-first column index (0-6) for the 1st of the month. */
const leadingBlanks = (year: number, month: number) =>
  (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

/**
 * Intensity for a worked day.
 *
 * A sequential ramp: one hue, light to dark, carrying "how much". The range is
 * [MIN_FILL, 1] rather than [0, 1] for two reasons, and the second is the one
 * that set the floor where it is.
 *
 * The quietest worked day must still read as worked, so zero is out.
 *
 * And the cell has a date sitting on it. Across a full ramp there is a middle
 * band where the disc is too light for the light ink and too dark for the dark
 * one — measured at (0.35, 0.52) in the bone world and (0.48, 0.66) in the
 * forest world — so a fill anywhere in it renders the date illegible whichever
 * ink is chosen. Flipping at a threshold cannot fix that, because the bands
 * are where both inks fail. Starting the ramp above the wider of the two lets
 * one ink serve the whole scale at 4.6:1 or better in both worlds.
 *
 * The cost is a shorter scale, paid knowingly: on a grid whose cells carry
 * dates, "did I work" has to survive before "how much" gets to be precise.
 *
 * scripts/contrast.mjs measures both ends of this ramp. Move the floor and
 * move the `0.66` there with it.
 */
const MIN_FILL = 0.66;

function intensityOf(cents: number, peakCents: number): number {
  if (peakCents <= 0) return MIN_FILL;
  return MIN_FILL + (1 - MIN_FILL) * (cents / peakCents);
}

/** The legend's steps, so the swatches describe the ramp actually drawn. */
const LEGEND_STEPS = [0, 1 / 3, 2 / 3, 1].map((t) => MIN_FILL + (1 - MIN_FILL) * t);

/**
 * The grid draws on the page field, inside a hairline region — there is no
 * filled panel anywhere in this world for it to sit on.
 *
 * One ink, the accent, which is ink rather than a hue in both worlds. A date
 * on the lightest worked disc measures 4.86:1, so the whole ramp clears AA
 * without a threshold flip.
 */
const CAL_INK = 'var(--accent)';

const fillFor = (intensity: number) =>
  `color-mix(in srgb, ${CAL_INK} ${Math.round(intensity * 100)}%, transparent)`;

const INK = {
  dim: 'text-fg-tertiary',
  heading: 'text-fg-secondary',
  onFill: 'text-accent-fg',
  ring: 'border-accent-fg',
  today: 'ring-fg-tertiary',
  press: 'active:bg-accent-wash',
  empty: 'bg-segment-track',
} as const;

/**
 * One day in the grid.
 *
 * A circle, not a rounded square: a filled disc reads as a marker on a date
 * where a filled square reads as a tile, and at 45px the difference is what
 * makes a month of work legible at a glance rather than a block of colour.
 *
 * Two things are encoded. How much, as fill intensity — one hue, light to
 * dark. And whether it is settled, as a dashed ring. Texture rather than a
 * second colour, because colour is already spent on "how much" and stacking
 * both onto one channel at this size makes neither readable.
 */
function DayCell({
  date,
  value,
  isToday,
  peakCents,
  size = 'md',
}: {
  date: string;
  value: DayValue | undefined;
  isToday: boolean;
  peakCents: number;
  size?: 'md' | 'xs';
}) {
  const dayNumber = Number(date.slice(8, 10));
  const worked = value !== undefined && value.shiftCount > 0;
  const intensity = worked ? intensityOf(value.cents, peakCents) : 0;

  const label = worked
    ? `${date}, ${formatCents(value.cents)}${value.estimated ? ' estimated' : ''}, ${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'}`
    : `${date}, no shifts`;

  return (
    <Link
      href={`/day/${date}`}
      aria-label={label}
      className={[
        'relative flex aspect-square items-center justify-center rounded-full',
        'transition-[background-color,transform] duration-150 active:scale-90',
        worked ? '' : `${INK.dim} ${INK.press}`,
        worked && value.estimated ? `border border-dashed ${INK.ring}` : '',
        isToday && !worked ? `ring-1 ring-inset ${INK.today}` : '',
      ].join(' ')}
      style={worked ? { backgroundColor: fillFor(intensity) } : undefined}
    >
      {size === 'md' && (
        <span
          className={[
            't-caption tabular-nums',
            worked ? INK.onFill : '',
            isToday ? 'font-semibold underline underline-offset-2' : '',
          ].join(' ')}
        >
          {dayNumber}
        </span>
      )}
    </Link>
  );
}

/**
 * The grid bleeds 8px past the panel's text padding on each side.
 *
 * Seven columns inside that padding land at 42px, and 42px is not a touch
 * target. The eight pixels buy 44. Text keeps the panel's real margin; only
 * the grid reaches past it, which also lets the row of discs read as its own
 * band rather than as another paragraph.
 */
const GRID_BLEED = '-mx-2';

/** A month of work. Cells land at 44px at 390px, which sets every other size. */
export function MonthCalendar({
  year,
  month,
  days,
  today,
  peakCents,
}: {
  year: number;
  month: number;
  days: Map<string, DayValue>;
  today: string;
  peakCents: number;
}) {
  const total = daysInMonth(year, month);
  const cells: (string | null)[] = [
    ...Array<null>(leadingBlanks(year, month)).fill(null),
    ...Array.from(
      { length: total },
      (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`,
    ),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className={GRID_BLEED}>
      <Weekdays />

      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) =>
          date === null ? (
            <div key={`blank-${i}`} aria-hidden="true" />
          ) : (
            <DayCell
              key={date}
              date={date}
              value={days.get(date)}
              isToday={date === today}
              peakCents={peakCents}
            />
          ),
        )}
      </div>
    </div>
  );
}

/** The column heads. One weight for all seven — Sunday is not quieter than
    Monday, and giving it the dimmest token was the calendar's least legible
    text sitting on its least expected day. */
function Weekdays() {
  return (
    <div className="mb-1.5 grid grid-cols-7 gap-1">
      {WEEKDAY_INITIALS.map((initial, i) => (
        <div key={i} aria-hidden="true" className={`t-label text-center ${INK.heading}`}>
          {initial}
        </div>
      ))}
    </div>
  );
}

/**
 * A single week, laid out like the month grid so switching between them does
 * not move the days under the user's thumb.
 */
export function WeekStrip({
  dates,
  days,
  today,
  peakCents,
}: {
  dates: string[];
  days: Map<string, DayValue>;
  today: string;
  peakCents: number;
}) {
  return (
    <div className={GRID_BLEED}>
      <Weekdays />
      <div className="grid grid-cols-7 gap-1">
        {dates.map((date) => (
          <DayCell
            key={date}
            date={date}
            value={days.get(date)}
            isToday={date === today}
            peakCents={peakCents}
          />
        ))}
      </div>
    </div>
  );
}

const MONTH_ABBR = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'short' });

/**
 * Twelve miniature month grids.
 *
 * Cells land near 11px, so there is no room for a date — the dot IS the
 * information, and the month heading carries the context. Tapping a month
 * opens it full size rather than trying to make an 11px target useful.
 */
export function YearGrids({
  year,
  days,
  today,
  peakCents,
}: {
  year: number;
  days: Map<string, DayValue>;
  today: string;
  peakCents: number;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-x-3 gap-y-4"
    >
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
        const total = daysInMonth(year, month);
        const cells: (string | null)[] = [
          ...Array<null>(leadingBlanks(year, month)).fill(null),
          ...Array.from(
            { length: total },
            (_, d) =>
              `${year}-${String(month).padStart(2, '0')}-${String(d + 1).padStart(2, '0')}`,
          ),
        ];
        while (cells.length % 7 !== 0) cells.push(null);

        const monthCents = cells.reduce(
          (sum, date) => sum + (date ? (days.get(date)?.cents ?? 0) : 0),
          0,
        );

        return (
          <Link
            key={month}
            href={`/?range=month&at=${year}-${String(month).padStart(2, '0')}-01`}
            className={`block rounded-lg p-1 transition-colors duration-150 ${INK.press}`}
            aria-label={`${MONTH_ABBR.format(new Date(Date.UTC(year, month - 1, 1)))} ${year}, ${formatCents(monthCents)}`}
          >
            <p className={`t-label mb-1 ${INK.heading}`}>
              {MONTH_ABBR.format(new Date(Date.UTC(year, month - 1, 1)))}
            </p>
            <div className="grid grid-cols-7 gap-[2px]">
              {cells.map((date, i) => {
                if (date === null) return <div key={`b-${i}`} aria-hidden="true" />;
                const value = days.get(date);
                const worked = value !== undefined && value.shiftCount > 0;
                const dotIntensity = worked ? intensityOf(value.cents, peakCents) : 0;
                return (
                  <div
                    key={date}
                    aria-hidden="true"
                    className={[
                      'aspect-square rounded-full',
                      worked ? '' : INK.empty,
                      worked && value.estimated ? `border border-dashed ${INK.ring}` : '',
                      date === today ? `ring-1 ${INK.today}` : '',
                    ].join(' ')}
                    style={worked ? { backgroundColor: fillFor(dotIntensity) } : undefined}
                  />
                );
              })}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Explains the two things the grids encode, without a colour-only legend.
 *
 * Each half renders only where it has something to explain. A scale from Less
 * to More over a grid with nothing in it annotates an absence, and the
 * dashboard's first-run state was showing both halves over an empty month.
 */
export function CalendarLegend({
  showIntensity,
  showEstimated,
}: {
  showIntensity: boolean;
  showEstimated: boolean;
}) {
  if (!showIntensity && !showEstimated) return null;

  return (
    <div
      className="flex items-center justify-between gap-3"
    >
      {showIntensity ? (
        <div className="flex items-center gap-1.5">
          <span className={`t-label ${INK.heading}`}>Less</span>
          {LEGEND_STEPS.map((a) => (
            <span
              key={a}
              aria-hidden="true"
              className="size-3 rounded-full"
              style={{ backgroundColor: fillFor(a) }}
            />
          ))}
          <span className={`t-label ${INK.heading}`}>More</span>
        </div>
      ) : (
        <span />
      )}
      {showEstimated && (
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={`size-3 rounded-full border border-dashed ${INK.dim} border-current`}
          />
          {/* "Estimated", not "Unconfirmed": a future shift cannot be confirmed
              because it has not happened yet, but it is just as provisional. */}
          <span className={`t-label ${INK.heading}`}>Estimated</span>
        </div>
      )}
    </div>
  );
}

/**
 * The date strip.
 *
 * A row of days you scroll rather than a grid you scan. It suits the shape of
 * the work: a part-timer has three or four shifts in a week, so a month grid
 * spends most of its area proving that nothing happened — 340px of empty
 * cells was the single largest thing on the old dashboard.
 *
 * The strip keeps every job the grid had. Each day is still a 44px target
 * that opens that date, still carries its fill intensity, still shows a
 * dashed ring when the figure behind it is an estimate.
 *
 * It scrolls to today on load rather than to the start of the range, because
 * the question being asked is almost always about now. `scroll-snap` on the
 * cells keeps a flicked strip from stopping half way across a date.
 */
export function DateStrip({
  dates,
  days,
  today,
  peakCents,
}: {
  dates: string[];
  days: Map<string, DayValue>;
  today: string;
  peakCents: number;
}) {
  return (
    <StripScroll
      className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ scrollSnapType: 'x proximity' }}
    >
      <ol className="flex gap-1.5">
        {dates.map((date) => (
          <li key={date} style={{ scrollSnapAlign: 'center' }}>
            <StripDay
              date={date}
              value={days.get(date)}
              isToday={date === today}
              peakCents={peakCents}
            />
          </li>
        ))}
      </ol>
    </StripScroll>
  );
}

const STRIP_INITIAL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function StripDay({
  date,
  value,
  isToday,
  peakCents,
}: {
  date: string;
  value: DayValue | undefined;
  isToday: boolean;
  peakCents: number;
}) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = STRIP_INITIAL[(new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7];
  const worked = value !== undefined && value.shiftCount > 0;
  const intensity = worked ? intensityOf(value.cents, peakCents) : 0;

  const label = worked
    ? `${date}, ${formatCents(value.cents)}${value.estimated ? ' estimated' : ''}, ${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'}`
    : `${date}, no shifts`;

  return (
    <Link
      href={`/day/${date}`}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      data-today={isToday ? '' : undefined}
      className={`flex w-11 flex-col items-center gap-1 rounded-xl py-1.5 ${INK.press}`}
    >
      <span className={`t-label ${isToday ? 'text-fg' : INK.heading}`}>{weekday}</span>
      <span
        className={[
          'flex size-9 items-center justify-center rounded-full',
          'transition-[background-color,transform] duration-150 active:scale-90',
          worked ? INK.onFill : INK.dim,
          worked && value.estimated ? `border border-dashed ${INK.ring}` : '',
          isToday && !worked ? `ring-1 ring-inset ${INK.today}` : '',
        ].join(' ')}
        style={worked ? { backgroundColor: fillFor(intensity) } : undefined}
      >
        <span className={`t-caption tabular-nums ${isToday ? 'font-semibold' : ''}`}>{d}</span>
      </span>
    </Link>
  );
}
