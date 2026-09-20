import { formatCents } from '@/lib/pay/money';
import { formatMinutes } from '@/lib/pay/calc';

/**
 * Charts for this app are ONE hue plus texture, never two hues.
 *
 * That is a measured decision, not a preference. Running the palette
 * validator on the two colours a two-series chart would have used —
 * brass #cbb47c against the dark-mode green #8fbf9a — returns ΔE 8.1 in
 * normal vision, well under the floor of 15. Full-colour readers could not
 * reliably tell the segments apart, never mind anyone with a colour vision
 * deficiency. Contrast against the surface passes in both modes, which is
 * the check that governs a single-hue chart.
 *
 * So "confirmed" is a solid fill of the accent and "estimated" is the same
 * accent hatched at 45 degrees. Texture survives greyscale, printing and
 * forced-colours, and it leaves the colour channel free to mean one thing.
 */
const HATCH =
  'repeating-linear-gradient(45deg, var(--accent) 0 2px, transparent 2px 5px)';

export function ChartLegend() {
  return (
    <div className="flex items-center gap-4">
      <span className="flex items-center gap-1.5">
        <span aria-hidden="true" className="size-3 rounded-[2px] bg-accent" />
        <span className="t-label text-fg-secondary">Confirmed</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="size-3 rounded-[2px] border border-accent/40"
          style={{ backgroundImage: HATCH }}
        />
        <span className="t-label text-fg-secondary">Estimated</span>
      </span>
    </div>
  );
}

export interface Bar {
  key: string;
  label: string;
  /** Tick label under the bar. Kept short; not every bar gets one. */
  tick?: string;
  confirmed: number;
  estimated: number;
}

/**
 * Earnings over time — vertical bars, one per week.
 *
 * Bars are anchored to a single baseline with one axis. The segments are
 * separated by a 2px surface gap so a stacked bar never reads as one solid
 * block, and only the tallest bar carries a direct label — a number on every
 * bar at 390px is noise, not information.
 */
export function WeeklyBars({
  bars,
  caption,
}: {
  bars: Bar[];
  caption: string;
}) {
  const peak = Math.max(1, ...bars.map((b) => b.confirmed + b.estimated));
  const tallest = bars.reduce(
    (best, b, i) => (b.confirmed + b.estimated > bars[best].confirmed + bars[best].estimated ? i : best),
    0,
  );

  return (
    <figure className="m-0">
      <div className="flex h-36 items-end gap-[3px]" role="presentation">
        {bars.map((bar, i) => {
          const total = bar.confirmed + bar.estimated;
          const totalPct = (total / peak) * 100;
          const confirmedPct = total === 0 ? 0 : (bar.confirmed / total) * 100;
          const estimatedPct = total === 0 ? 0 : (bar.estimated / total) * 100;

          return (
            // Capped width, centred in its slot. With only a few weeks logged,
            // flex-1 alone renders slabs — thin marks are the rule, and a bar
            // chart that fattens as data thins reads as decoration.
            <div
              key={bar.key}
              className="mx-auto flex h-full max-w-9 flex-1 flex-col justify-end"
            >
              {/* The label lane is a constant height in EVERY column, even
                  the empty ones. Rendering it only above the tallest bar took
                  that height out of that bar alone, so the highest value drew
                  shortest — the chart contradicted its own data. */}
              <span className="t-label mb-1 h-4 text-center text-fg-secondary tabular-nums">
                {i === tallest && total > 0
                  ? formatCents(total).replace(/\.00$/, '')
                  : ' '}
              </span>
              <div
                className="flex w-full flex-col justify-end rounded-t-[4px] overflow-hidden"
                style={{ height: `${Math.max(total > 0 ? 3 : 0, totalPct)}%` }}
                title={bar.label}
              >
                {bar.estimated > 0 && (
                  <div
                    className="w-full border-x border-t border-accent/40"
                    style={{
                      height: `${estimatedPct}%`,
                      backgroundImage: HATCH,
                      // 2px of surface between the two segments, so the
                      // boundary is a gap rather than a colour change.
                      marginBottom: bar.confirmed > 0 ? 2 : 0,
                    }}
                  />
                )}
                {bar.confirmed > 0 && (
                  <div className="w-full bg-accent" style={{ height: `${confirmedPct}%` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Recessive baseline: a hairline, not a ruled axis. */}
      <div className="mt-1 h-px w-full bg-separator" />

      <div className="mt-1.5 flex gap-[3px]">
        {bars.map((bar) => (
          <span
            key={bar.key}
            className="t-label flex-1 text-center text-fg-tertiary tabular-nums"
          >
            {bar.tick ?? ''}
          </span>
        ))}
      </div>

      <figcaption className="sr-only">
        {caption}
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Confirmed</th>
              <th>Estimated</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((bar) => (
              <tr key={bar.key}>
                <td>{bar.label}</td>
                <td>{formatCents(bar.confirmed)}</td>
                <td>{formatCents(bar.estimated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

export interface DayBar {
  key: string;
  label: string;
  confirmedMinutes: number;
  estimatedMinutes: number;
}

/**
 * Hours by day of week — horizontal, because seven text labels read far
 * better beside a bar than rotated under one at 390px.
 *
 * Includes estimated hours rather than hiding them: a part-timer's roster is
 * mostly forward-looking, so a confirmed-only chart would be near-empty and
 * would quietly understate every day. Marking them is more honest than
 * omitting them.
 */
export function DayOfWeekBars({ days }: { days: DayBar[] }) {
  const peak = Math.max(1, ...days.map((d) => d.confirmedMinutes + d.estimatedMinutes));

  return (
    <figure className="m-0">
      <div className="space-y-1.5">
        {days.map((day) => {
          const total = day.confirmedMinutes + day.estimatedMinutes;
          return (
            <div key={day.key} className="flex items-center gap-2">
              <span className="t-label w-7 shrink-0 text-fg-secondary">{day.label}</span>
              <div className="flex h-6 flex-1 items-center gap-[2px]">
                {day.confirmedMinutes > 0 && (
                  <div
                    className="h-full rounded-[3px] bg-accent"
                    style={{ width: `${(day.confirmedMinutes / peak) * 100}%` }}
                  />
                )}
                {day.estimatedMinutes > 0 && (
                  <div
                    className="h-full rounded-[3px] border border-accent/40"
                    style={{
                      width: `${(day.estimatedMinutes / peak) * 100}%`,
                      backgroundImage: HATCH,
                    }}
                  />
                )}
              </div>
              <span className="t-caption w-14 shrink-0 text-right text-fg-secondary tabular-nums">
                {total === 0 ? '—' : formatMinutes(total)}
              </span>
            </div>
          );
        })}
      </div>

      <figcaption className="sr-only">
        Hours worked by day of week.
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Confirmed</th>
              <th>Estimated</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.key}>
                <td>{day.label}</td>
                <td>{formatMinutes(day.confirmedMinutes)}</td>
                <td>{formatMinutes(day.estimatedMinutes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}
