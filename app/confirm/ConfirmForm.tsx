'use client';

import { useActionState, useState } from 'react';
import { Card, ErrorNote, PageHeader, PrimaryButton, Screen } from '@/app/_components/ui';
import { saveConfirmations, type ConfirmState } from './actions';

export interface PendingShift {
  id: string;
  workDate: string;
  dayLabel: string;
  /** Planned start, HH:MM. */
  start: string;
  /** Planned finish, HH:MM — the default answer. */
  plannedEnd: string;
  plannedStartLabel: string;
  plannedEndLabel: string;
  plannedBreakMinutes: number;
}

interface Answer {
  end: string;
  breakMinutes: number;
  /** Whether the user has touched this row. Untouched means "as planned". */
  touched: boolean;
}

export function ConfirmForm({
  shifts,
  breaksPaid,
}: {
  shifts: PendingShift[];
  breaksPaid: boolean;
}) {
  const [state, formAction, pending] = useActionState<ConfirmState, FormData>(
    saveConfirmations,
    {},
  );

  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      shifts.map((s) => [
        s.id,
        { end: s.plannedEnd, breakMinutes: s.plannedBreakMinutes, touched: false },
      ]),
    ),
  );

  function update(id: string, patch: Partial<Answer>) {
    setAnswers((current) => ({
      ...current,
      [id]: { ...current[id], ...patch, touched: true },
    }));
  }

  const payload = JSON.stringify(
    shifts.map((s) => ({
      id: s.id,
      workDate: s.workDate,
      start: s.start,
      end: answers[s.id].end,
      breakMinutes: answers[s.id].breakMinutes,
    })),
  );

  const changed = shifts.filter((s) => answers[s.id].touched).length;

  return (
    <Screen>
      <PageHeader
        eyebrow={`${shifts.length} to confirm`}
        title="What actually happened?"
        back={{ href: '/', label: 'This period' }}
      />

      <Card className="mb-3 px-5 py-4">
        <p className="t-caption text-fg-secondary">
          Each one is filled in as rostered. Change only the ones that ran differently
          &mdash; a late finish, or a break you never got. That gap is where pay quietly
          goes missing, and nobody else is writing it down.
        </p>
      </Card>

      <form action={formAction} className="flex flex-1 flex-col">
        <input type="hidden" name="answers" value={payload} />

        <div className="space-y-3">
          {shifts.map((shift) => {
            const answer = answers[shift.id];
            const lateFinish = answer.end !== shift.plannedEnd;
            const breakMissed = !breaksPaid && answer.breakMinutes < shift.plannedBreakMinutes;

            return (
              <Card key={shift.id} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="t-heading">{shift.dayLabel}</p>
                  <p className="t-caption text-fg-secondary tabular-nums">
                    Rostered {shift.plannedStartLabel}&ndash;{shift.plannedEndLabel}
                  </p>
                </div>

                <div className={`mt-3 grid gap-2 ${breaksPaid ? 'grid-cols-1' : 'grid-cols-2'}`}>
                  <label className="block">
                    <span className="t-caption text-fg-secondary">Actually finished</span>
                    <input
                      type="time"
                      value={answer.end}
                      onChange={(e) => update(shift.id, { end: e.target.value })}
                      className="t-figure mt-1 min-h-12 w-full rounded-lg bg-segment-track px-2 text-center tabular-nums"
                    />
                  </label>

                  {!breaksPaid && (
                    <fieldset>
                      <legend className="t-caption text-fg-secondary">Break taken</legend>
                      <div className="mt-1 flex gap-1">
                        {[0, 15, 30, 45].map((m) => {
                          const selected = answer.breakMinutes === m;
                          return (
                            <label
                              key={m}
                              className={[
                                'flex min-h-12 flex-1 cursor-pointer items-center',
                                'justify-center rounded-lg transition-colors duration-150',
                                selected
                                  ? 'bg-accent text-accent-fg'
                                  : 'bg-segment-track text-fg-secondary',
                              ].join(' ')}
                            >
                              <input
                                type="radio"
                                name={`break-${shift.id}`}
                                checked={selected}
                                onChange={() => update(shift.id, { breakMinutes: m })}
                                className="sr-only"
                              />
                              <span className="t-caption tabular-nums">
                                {m === 0 ? 'None' : m}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  )}
                </div>

                {(lateFinish || breakMissed) && (
                  <p className="t-caption mt-2.5 text-attention">
                    {[
                      lateFinish && 'Different finish than rostered',
                      breakMissed && 'Less break than rostered',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    {' — this is the bit payroll will not know.'}
                  </p>
                )}
              </Card>
            );
          })}
        </div>

        {state.error && <ErrorNote>{state.error}</ErrorNote>}

        <div className="mt-auto pt-6">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Confirm these shifts'}
          </PrimaryButton>
          <p className="t-caption mt-2.5 text-center text-fg-secondary">
            {changed === 0
              ? 'All as rostered, unless you change something.'
              : `${changed} of ${shifts.length} ${changed === 1 ? `differs` : `differ`} from the roster.`}
          </p>
        </div>
      </form>
    </Screen>
  );
}
