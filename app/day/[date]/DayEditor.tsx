'use client';

import { useActionState, useState } from 'react';
import { Card, ErrorNote, PrimaryButton } from '@/app/_components/ui';
import { formatCents } from '@/lib/pay/money';
import { addShiftOnDay, updateShift, deleteShift, type DayState } from './actions';

const BREAKS = [0, 15, 30, 45, 60];

export interface EditableShift {
  id: string;
  start: string;
  end: string;
  breakMinutes: number;
  confirmed: boolean;
  actualEnd: string;
  actualBreak: number;
  cents: number;
}

/** Add a shift to a day that has none, or another to a day that already does. */
export function AddShiftForm({
  workDate,
  breaksPaid,
  usual,
  compact,
}: {
  workDate: string;
  breaksPaid: boolean;
  usual: { start: string; end: string; breakMinutes: number };
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<DayState, FormData>(
    addShiftOnDay,
    {},
  );
  const [open, setOpen] = useState(!compact);
  const [start, setStart] = useState(usual.start);
  const [end, setEnd] = useState(usual.end);
  const [breakMinutes, setBreakMinutes] = useState(usual.breakMinutes);

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-caption min-h-11 w-full rounded-xl border border-dashed border-border text-fg-secondary"
      >
        + Add another shift
      </button>
    );
  }

  return (
    <Card className="px-5 py-4">
      <p className="t-heading">Add a shift</p>
      <form action={formAction} className="mt-3">
        <input type="hidden" name="workDate" value={workDate} />
        <div className={`grid gap-2 ${breaksPaid ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TimeField label="Starts" name="start" value={start} onChange={setStart} />
          <TimeField label="Finishes" name="end" value={end} onChange={setEnd} />
          {!breaksPaid && (
            <BreakSelect
              name="breakMinutes"
              value={breakMinutes}
              onChange={setBreakMinutes}
            />
          )}
        </div>
        {end <= start && (
          <p className="t-caption mt-2 text-fg-secondary">
            Finishes after midnight &mdash; still counted on this day.
          </p>
        )}
        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        <div className="mt-3">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Add shift'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}

/** Edit one existing shift, including confirming what actually happened. */
export function EditShiftForm({
  shift,
  workDate,
  breaksPaid,
  index,
}: {
  shift: EditableShift;
  workDate: string;
  breaksPaid: boolean;
  index: number;
}) {
  const [state, formAction, pending] = useActionState<DayState, FormData>(
    updateShift,
    {},
  );
  const [start, setStart] = useState(shift.start);
  const [end, setEnd] = useState(shift.end);
  const [breakMinutes, setBreakMinutes] = useState(shift.breakMinutes);
  const [confirm, setConfirm] = useState(shift.confirmed);
  const [actualEnd, setActualEnd] = useState(shift.actualEnd || shift.end);
  const [actualBreak, setActualBreak] = useState(shift.actualBreak);

  return (
    <Card className="px-5 py-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="t-heading">Shift {index + 1}</p>
        <p className={`t-figure ${shift.confirmed ? 'is-confirmed' : 'is-estimated'}`}>
          {formatCents(shift.cents)}
        </p>
      </div>

      <form action={formAction} className="mt-3">
        <input type="hidden" name="id" value={shift.id} />
        <input type="hidden" name="workDate" value={workDate} />

        <p className="t-label text-fg-secondary">Rostered</p>
        <div className={`mt-1 grid gap-2 ${breaksPaid ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TimeField label="Starts" name="start" value={start} onChange={setStart} />
          <TimeField label="Finishes" name="end" value={end} onChange={setEnd} />
          {!breaksPaid && (
            <BreakSelect name="breakMinutes" value={breakMinutes} onChange={setBreakMinutes} />
          )}
        </div>

        <label className="mt-4 flex min-h-11 items-center gap-2.5">
          <input
            type="checkbox"
            name="confirm"
            checked={confirm}
            onChange={(e) => setConfirm(e.target.checked)}
            className="size-5 accent-[var(--accent)]"
          />
          <span className="t-heading">I worked this</span>
        </label>

        {confirm ? (
          <div className={`mt-2 grid gap-2 ${breaksPaid ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <TimeField
              label="Actually finished"
              name="actualEnd"
              value={actualEnd}
              onChange={setActualEnd}
            />
            {!breaksPaid && (
              <BreakSelect
                label="Break taken"
                name="actualBreak"
                value={actualBreak}
                onChange={setActualBreak}
              />
            )}
          </div>
        ) : (
          <p className="t-caption mt-1 text-fg-secondary">
            Until this is ticked the shift counts as an estimate everywhere.
          </p>
        )}

        {state.error && <ErrorNote>{state.error}</ErrorNote>}

        <div className="mt-3">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
        </div>
      </form>

      {/* Its own form, so deleting cannot be triggered by submitting the edit. */}
      <form action={deleteShift} className="mt-2">
        <input type="hidden" name="id" value={shift.id} />
        <input type="hidden" name="workDate" value={workDate} />
        <button
          type="submit"
          className="t-caption min-h-11 w-full rounded-xl text-critical"
        >
          Delete this shift
        </button>
      </form>
    </Card>
  );
}

function TimeField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="t-caption text-fg-secondary">{label}</span>
      <input
        type="time"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="t-figure mt-1 min-h-12 w-full rounded-lg bg-segment-track px-2 text-center tabular-nums"
      />
    </label>
  );
}

function BreakSelect({
  label = 'Break',
  name,
  value,
  onChange,
}: {
  label?: string;
  name: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="t-caption text-fg-secondary">{label}</span>
      <div className="relative mt-1">
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="t-figure min-h-12 w-full appearance-none rounded-lg bg-segment-track pl-2 pr-6 text-center"
        >
          {BREAKS.map((m) => (
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
  );
}
