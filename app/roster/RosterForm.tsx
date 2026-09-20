'use client';

import { useActionState, useState } from 'react';
import { Card, ErrorNote, PageHeader, PrimaryButton, Screen } from '@/app/_components/ui';
import { saveRoster, type RosterState } from './actions';

interface Draft {
  key: number;
  workDate: string;
  start: string;
  end: string;
  breakMinutes: number;
}

export interface UsualShape {
  start: string;
  end: string;
  breakMinutes: number;
  learned: boolean;
}

const BREAK_CHOICES = [0, 15, 30, 45, 60];

export function RosterForm({
  weekLabel,
  days,
  usual,
  breaksPaid,
}: {
  weekLabel: string;
  /** The seven dates of the week being entered, with their labels. */
  days: { date: string; weekday: string; dayNumber: string; sunday: boolean }[];
  usual: UsualShape;
  breaksPaid: boolean;
}) {
  const [state, formAction, pending] = useActionState<RosterState, FormData>(
    saveRoster,
    {},
  );

  // "How many shifts?" first, exactly as the weekly ritual goes — you know the
  // count before you know the details.
  const [count, setCount] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>([]);

  function setShiftCount(next: number) {
    const clamped = Math.max(0, Math.min(7, next));
    setCount(clamped);
    setDrafts((current) => {
      if (clamped <= current.length) return current.slice(0, clamped);
      const added = Array.from({ length: clamped - current.length }, (_, i) => {
        const index = current.length + i;
        return {
          key: Date.now() + index,
          // Spread new shifts across the week rather than stacking them all on
          // Monday — most people work later in the week, and any prefill that
          // is wrong the same way every time is worse than none.
          workDate: days[Math.min(4 + index, 6)]?.date ?? days[0].date,
          start: usual.start,
          end: usual.end,
          breakMinutes: usual.breakMinutes,
        };
      });
      return [...current, ...added];
    });
  }

  function update(key: number, patch: Partial<Draft>) {
    setDrafts((current) => current.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  }

  const payload = JSON.stringify(
    drafts.map(({ workDate, start, end, breakMinutes }) => ({
      workDate,
      start,
      end,
      breakMinutes,
    })),
  );

  return (
    <Screen>
      <PageHeader
        eyebrow={weekLabel}
        title="What are you working?"
        back={{ href: '/', label: 'This period' }}
      />

      <form action={formAction} className="flex flex-1 flex-col">
        <input type="hidden" name="shifts" value={payload} />

        {/* -- How many. ------------------------------------------------ */}
        <Card className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="t-heading">How many shifts?</p>
            {usual.learned && (
              <p className="t-caption mt-0.5 text-fg-secondary">
                Prefilled with your usual {usual.start}&ndash;{usual.end}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Stepper label="One fewer shift" onClick={() => setShiftCount(count - 1)} disabled={count === 0}>
              &minus;
            </Stepper>
            <span className="t-figure w-7 text-center tabular-nums" aria-live="polite">
              {count}
            </span>
            <Stepper label="One more shift" onClick={() => setShiftCount(count + 1)} disabled={count === 7}>
              +
            </Stepper>
          </div>
        </Card>

        {/* -- Each shift. ---------------------------------------------- */}
        <div className="mt-3 space-y-3">
          {drafts.map((draft, index) => (
            <Card key={draft.key} className="px-5 py-4">
              <p className="t-label text-fg-secondary">Shift {index + 1}</p>

              <fieldset className="mt-2.5">
                <legend className="sr-only">Day for shift {index + 1}</legend>
                <div className="flex gap-1">
                  {days.map((day) => {
                    const selected = day.date === draft.workDate;
                    return (
                      <label
                        key={day.date}
                        className={[
                          'flex min-h-14 flex-1 cursor-pointer flex-col items-center',
                          'justify-center gap-0.5 rounded-lg transition-colors duration-150',
                          selected
                            ? 'bg-accent text-accent-fg'
                            : 'bg-segment-track text-fg-secondary',
                        ].join(' ')}
                      >
                        <input
                          type="radio"
                          name={`day-${draft.key}`}
                          checked={selected}
                          onChange={() => update(draft.key, { workDate: day.date })}
                          className="sr-only"
                        />
                        <span className="t-label">{day.weekday}</span>
                        <span className="t-caption tabular-nums">{day.dayNumber}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className={`mt-3 grid gap-2 ${breaksPaid ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <TimeField
                  label="Starts"
                  value={draft.start}
                  onChange={(v) => update(draft.key, { start: v })}
                />
                <TimeField
                  label="Finishes"
                  value={draft.end}
                  onChange={(v) => update(draft.key, { end: v })}
                />
                {!breaksPaid && (
                  <label className="block">
                    <span className="t-caption text-fg-secondary">Break</span>
                    {/* A chevron, because sitting in a row with two native time
                        inputs this would otherwise read as a static label. */}
                    <div className="relative mt-1">
                      <select
                        value={draft.breakMinutes}
                        onChange={(e) =>
                          update(draft.key, { breakMinutes: Number(e.target.value) })
                        }
                        className="t-figure min-h-12 w-full appearance-none rounded-lg bg-segment-track pl-2 pr-6 text-center"
                      >
                        {BREAK_CHOICES.map((m) => (
                          <option key={m} value={m}>
                            {m === 0 ? 'None' : `${m}m`}
                          </option>
                        ))}
                      </select>
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-fg-secondary"
                      >
                        &#9662;
                      </span>
                    </div>
                  </label>
                )}
              </div>

              {crossesMidnight(draft.start, draft.end) && (
                <p className="t-caption mt-2 text-fg-secondary">
                  Finishes after midnight &mdash; counted on {dayLabel(days, draft.workDate)}.
                </p>
              )}
            </Card>
          ))}
        </div>

        {count === 0 && (
          <p className="t-caption mt-6 text-center text-fg-secondary">
            Tap + for each shift on next week&rsquo;s roster.
          </p>
        )}

        {state.error && <ErrorNote>{state.error}</ErrorNote>}

        <div className="mt-auto pt-6">
          <PrimaryButton type="submit" disabled={count === 0 || pending}>
            {pending
              ? 'Saving…'
              : `Log ${count || 'no'} shift${count === 1 ? '' : 's'}`}
          </PrimaryButton>
          <p className="t-caption mt-2.5 text-center text-fg-secondary">
            You&rsquo;ll confirm what actually happened at the end of the week.
          </p>
        </div>
      </form>
    </Screen>
  );
}

function Stepper({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="t-figure flex size-11 items-center justify-center rounded-lg bg-segment-track text-fg transition-[opacity,transform] duration-150 active:scale-95 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="t-caption text-fg-secondary">{label}</span>
      {/* Native time input: the OS picker is faster than anything custom and
          is already familiar. */}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="t-figure mt-1 min-h-12 w-full rounded-lg bg-segment-track px-2 text-center tabular-nums"
      />
    </label>
  );
}

function crossesMidnight(start: string, end: string) {
  return end <= start;
}

function dayLabel(
  days: { date: string; weekday: string; dayNumber: string }[],
  date: string,
) {
  const day = days.find((d) => d.date === date);
  return day ? `${day.weekday} ${day.dayNumber}` : 'the day it starts';
}
