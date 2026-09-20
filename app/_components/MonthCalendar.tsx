import Link from 'next/link';
import { formatCents } from '@/lib/pay/money';
import type { DayValue } from '@/lib/pay/aggregate';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Monday-first column index (0-6) for the 1st of the month. */
function leadingBlanks(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
}

/**
 * A month of work at 390px.
 *
 * Cells land around 45px, which is the whole design constraint: it is a
 * usable touch target with room for a date and one more signal, and nothing
 * else. So intensity is carried by fill alpha, and the estimated/confirmed
 * distinction by a dashed ring rather than a second colour — colour is
 * already spent on "how much", and stacking meaning onto one channel at this
 * size makes both unreadable.
 */
export function MonthCalendar({
  year,
  month,
  days,
  today,
  /** The largest day value in view, so intensity is relative to the month. */
  peakCents,
}: {
  year: number;
  month: number;
  days: Map<string, DayValue>;
  today: string;
  peakCents: number;
}) {
  const total = daysInMonth(year, month);
  const blanks = leadingBlanks(year, month);

  const cells: (string | null)[] = [
    ...Array<null>(blanks).fill(null),
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

function DayCell({
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
  const dayNumber = Number(date.slice(8, 10));
  const worked = value !== undefined && value.shiftCount > 0;

  // Floor at 0.22 so the lightest worked day is still clearly worked, and
  // scale the rest across the remaining range. A linear map from zero would
  // make a quiet day indistinguishable from a day off.
  const intensity = worked && peakCents > 0 ? 0.22 + 0.78 * (value.cents / peakCents) : 0;

  const label = worked
    ? `${date}, ${formatCents(value.cents)}${value.estimated ? ' estimated' : ''}, ${value.shiftCount} shift${value.shiftCount === 1 ? '' : 's'}`
    : `${date}, no shifts`;

  return (
    <Link
      href={`/day/${date}`}
      aria-label={label}
      className={[
        'relative flex aspect-square items-center justify-center rounded-lg',
        'transition-colors duration-150',
        // A day off carries NO fill. Giving it a faint one made it read as a
        // quiet worked day, which is the one confusion a work calendar cannot
        // afford: fill means worked, full stop.
        worked ? '' : 'text-fg-tertiary active:bg-segment-track',
        // A dashed ring is the estimated marker. It survives greyscale, and it
        // does not compete with fill alpha for the "how much" channel.
        worked && value.estimated ? 'border border-dashed border-accent' : '',
      ].join(' ')}
      style={
        worked
          ? {
              backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 100)}%, transparent)`,
            }
          : undefined
      }
    >
      <span
        className={[
          't-caption tabular-nums',
          worked && intensity > 0.55 ? 'text-accent-fg' : worked ? 'text-fg' : '',
          isToday ? 'font-semibold underline underline-offset-2' : '',
        ].join(' ')}
      >
        {dayNumber}
      </span>
    </Link>
  );
}

/** Explains the two things the grid encodes, without a colour-only legend. */
export function CalendarLegend() {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <span className="t-label text-fg-secondary">Less</span>
        {[0.22, 0.45, 0.7, 1].map((a) => (
          <span
            key={a}
            aria-hidden="true"
            className="size-3 rounded-[3px]"
            style={{
              backgroundColor: `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)`,
            }}
          />
        ))}
        <span className="t-label text-fg-secondary">More</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-[3px] border border-dashed border-accent"
        />
        {/* "Estimated", not "Unconfirmed": a future shift cannot be confirmed
            because it has not happened yet, but it is just as provisional.
            One word for one meaning, matching the ~ used everywhere else. */}
        <span className="t-label text-fg-secondary">Estimated</span>
      </div>
    </div>
  );
}
