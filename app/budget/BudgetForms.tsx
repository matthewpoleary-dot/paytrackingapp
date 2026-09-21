'use client';

import { useActionState, useState } from 'react';
import { Card, ErrorNote, PrimaryButton } from '@/app/_components/ui';
import { CATEGORY_LABEL, SPEND_CATEGORIES } from '@/lib/budget/types';
import { importCsv, saveGoalLine, saveOutgoing, type BudgetState } from './actions';

/** Plain forms. A conversation is a terrible way to fix a typo in €4,200. */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="t-caption text-fg-secondary">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputClass =
  't-body min-h-12 w-full rounded-lg bg-segment-track px-3 outline-none placeholder:text-fg-placeholder';
const selectClass =
  't-body min-h-12 w-full appearance-none rounded-lg bg-segment-track pl-3 pr-8 outline-none';

function Chevron() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-fg-secondary"
    >
      &#9662;
    </span>
  );
}

export function OutgoingForm({ onDone }: { onDone?: () => void }) {
  const [state, action, pending] = useActionState<BudgetState, FormData>(saveOutgoing, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-caption min-h-11 w-full rounded-xl border border-dashed border-border text-fg-secondary"
      >
        + Add an outgoing
      </button>
    );
  }

  return (
    <Card className="px-5 py-4">
      <p className="t-heading">Add an outgoing</p>
      <form action={action} className="mt-3 space-y-2.5">
        <Field label="What is it?">
          <input name="label" placeholder="Rent, phone, gym…" className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Amount">
            <div className="relative">
              <span className="t-body pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-secondary">
                &euro;
              </span>
              <input
                name="amount"
                inputMode="decimal"
                placeholder="650"
                aria-label="Amount in euro"
                className={`${inputClass} pl-7 tabular-nums`}
              />
            </div>
          </Field>
          <Field label="How often">
            <div className="relative">
              <select name="cadence" defaultValue="monthly" className={selectClass}>
                <option value="weekly">Weekly</option>
                <option value="fortnightly">Fortnightly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <Chevron />
            </div>
          </Field>
        </div>

        <Field label="Category">
          <div className="relative">
            <select name="category" defaultValue="bills" className={selectClass}>
              {SPEND_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </Field>

        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        {state.message && <p className="t-caption text-positive">{state.message}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDone?.();
            }}
            className="t-caption min-h-[3.25rem] flex-1 rounded-xl border border-border text-fg-secondary"
          >
            Cancel
          </button>
          <div className="flex-1">
            <PrimaryButton type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Add'}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </Card>
  );
}

export function GoalLineForm() {
  const [state, action, pending] = useActionState<BudgetState, FormData>(saveGoalLine, {});
  const [open, setOpen] = useState(false);
  const [confidence, setConfidence] = useState('guess');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="t-caption min-h-11 w-full rounded-xl border border-dashed border-border text-fg-secondary"
      >
        + Add a cost
      </button>
    );
  }

  return (
    <Card className="px-5 py-4">
      <p className="t-heading">Add a cost</p>
      <form action={action} className="mt-3 space-y-2.5">
        <Field label="What is it?">
          <input name="label" placeholder="Flights, rent, deposit…" className={inputClass} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Amount">
            <div className="relative">
              <span className="t-body pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-secondary">
                &euro;
              </span>
              <input
                name="amount"
                inputMode="decimal"
                placeholder="240"
                aria-label="Amount in euro"
                className={`${inputClass} pl-7 tabular-nums`}
              />
            </div>
          </Field>
          <Field label="How sure?">
            <div className="relative">
              <select
                name="confidence"
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                className={selectClass}
              >
                <option value="quoted">Booked</option>
                <option value="researched">Looked up</option>
                <option value="guess">A guess</option>
              </select>
              <Chevron />
            </div>
          </Field>
        </div>

        {confidence === 'researched' && (
          <Field label="Where you found it">
            <input
              name="source_url"
              inputMode="url"
              placeholder="https://…"
              className={inputClass}
            />
          </Field>
        )}

        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        {state.message && <p className="t-caption text-positive">{state.message}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="t-caption min-h-[3.25rem] flex-1 rounded-xl border border-border text-fg-secondary"
          >
            Cancel
          </button>
          <div className="flex-1">
            <PrimaryButton type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Add'}
            </PrimaryButton>
          </div>
        </div>
      </form>
    </Card>
  );
}

export function CsvImport() {
  const [state, action, pending] = useActionState<BudgetState, FormData>(importCsv, {});
  const [filename, setFilename] = useState<string | null>(null);

  return (
    <Card className="px-5 py-4">
      <p className="t-heading">Import a statement</p>
      <p className="t-caption mt-1 text-fg-secondary">
        Revolut CSV export only. Re-importing the same file adds nothing twice.
      </p>

      <form action={action} className="mt-3">
        <label className="t-caption flex min-h-12 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-border px-3 text-center text-fg-secondary">
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            onChange={(e) => setFilename(e.target.files?.[0]?.name ?? null)}
            className="sr-only"
          />
          {filename ?? 'Choose a CSV file'}
        </label>

        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        {state.message && <p className="t-caption mt-2 text-positive">{state.message}</p>}

        <div className="mt-3">
          <PrimaryButton type="submit" disabled={pending || !filename}>
            {pending ? 'Importing…' : 'Import'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
