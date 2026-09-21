import Link from 'next/link';
import { formatCents } from '@/lib/pay/money';
import type { DayValue } from '@/lib/pay/aggregate';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Monday-first column index (0-6) for the 1st of the month. */
const leadingBlanks = (year: number, month: number) =>
  (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;

/**
 * Intensity for a worked day, 0–1.
 *
 * Floored at 0.22 so the quietest worked day still reads as worked; a linear
 * map from zero would make a short shift indistinguishable from a day off.
 */
function intensityOf(cents: number, peakCents: number): number {
  if (peakCents <= 0) return 0.22;
  return 0.22 + 0.78 * (cents / peakCents);
}

const fillFor = (intensity: number) =>
  `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, transparent)`;

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
        worked ? '' : 'text-fg-tertiary active:bg-segment-track',
        worked && value.estimated
          ? intensity > 0.55
            ? 'border border-dashed border-accent-fg'
            : 'border border-dashed border-accent'
          : '',
        isToday && !worked ? 'ring-1 ring-inset ring-fg-tertiary' : '',
      ].join(' ')}
      style={worked ? { backgroundColor: fillFor(intensity) } : undefined}
    >
      {size === 'md' && (
        <span
          className={[
            't-caption tabular-nums',
            worked && intensity > 0.55 ? 'text-accent-fg' : worked ? 'text-fg' : '',
            isToday ? 'font-semibold underline underline-offset-2' : '',
          ].join(' ')}
        >
          {dayNumber}
        </span>
      )}
    </Link>
  );
}

/** A month of work. Cells land around 45px at 390px, which sets every other size. */
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
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`t-label text-center ${i === 6 ? 'text-fg-tertiary' : 'text-fg-secondary'}`}
          >
            {initial}
          </div>
        ))}
      </div>

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
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <div
            key={i}
            aria-hidden="true"
            className={`t-label text-center ${i === 6 ? 'text-fg-tertiary' : 'text-fg-secondary'}`}
          >
            {initial}
          </div>
        ))}
      </div>
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
    <div className="grid grid-cols-3 gap-x-3 gap-y-4">
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
            className="block rounded-lg p-1 transition-colors duration-150 active:bg-segment-track"
            aria-label={`${MONTH_ABBR.format(new Date(Date.UTC(year, month - 1, 1)))} ${year}, ${formatCents(monthCents)}`}
          >
            <p className="t-label mb-1 text-fg-secondary">
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
                      worked ? '' : 'bg-segment-track/60',
                      worked && value.estimated
                        ? dotIntensity > 0.55
                          ? 'border border-dashed border-accent-fg'
                          : 'border border-dashed border-accent'
                        : '',
                      date === today ? 'ring-1 ring-fg-tertiary' : '',
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

/** Explains the two things the grids encode, without a colour-only legend. */
export function CalendarLegend() {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="t-label text-fg-secondary">Less</span>
        {[0.22, 0.45, 0.7, 1].map((a) => (
          <span
            key={a}
            aria-hidden="true"
            className="size-3 rounded-full"
            style={{ backgroundColor: fillFor(a) }}
          />
        ))}
        <span className="t-label text-fg-secondary">More</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-full border border-dashed border-accent"
        />
        {/* "Estimated", not "Unconfirmed": a future shift cannot be confirmed
            because it has not happened yet, but it is just as provisional. */}
        <span className="t-label text-fg-secondary">Estimated</span>
      </div>
    </div>
  );
}
