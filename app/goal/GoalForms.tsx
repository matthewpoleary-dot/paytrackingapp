'use client';

import { useActionState, useState } from 'react';
import { SegmentedControl } from '@/app/_components/SegmentedControl';
import { Card, ErrorNote, PrimaryButton } from '@/app/_components/ui';
import { addContribution, saveGoal, type GoalState } from './actions';

export function GoalForm({
  initial,
}: {
  initial: { name: string; target: string; targetDate: string } | null;
}) {
  const [state, formAction, pending] = useActionState<GoalState, FormData>(saveGoal, {});
  const [target, setTarget] = useState(initial?.target ?? '');

  return (
    <Card className="px-5 py-4">
      <p className="t-heading">{initial ? 'Edit your goal' : 'Set a goal'}</p>
      <form action={formAction} className="mt-3">
        <label className="block">
          <span className="t-caption text-fg-secondary">What for?</span>
          <input
            name="name"
            defaultValue={initial?.name ?? ''}
            placeholder="Deposit, trip, rainy day…"
            maxLength={80}
            className="t-body mt-1 min-h-12 w-full rounded-lg bg-segment-track px-3 outline-none placeholder:text-fg-placeholder"
          />
        </label>

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="t-caption text-fg-secondary">Target</span>
            <div className="relative mt-1">
              <span className="t-figure pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-secondary">
                &euro;
              </span>
              <input
                name="target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                inputMode="decimal"
                placeholder="3000"
                aria-label="Target amount in euro"
                className="t-figure min-h-12 w-full rounded-lg bg-segment-track pl-7 pr-3 tabular-nums outline-none placeholder:font-normal placeholder:text-fg-placeholder"
              />
            </div>
          </label>

          <label className="block">
            <span className="t-caption text-fg-secondary">By when (optional)</span>
            <input
              type="date"
              name="targetDate"
              defaultValue={initial?.targetDate ?? ''}
              className="t-figure mt-1 min-h-12 w-full rounded-lg bg-segment-track px-2 text-center tabular-nums"
            />
          </label>
        </div>

        <p className="t-caption mt-2 text-fg-secondary">
          Leave the date blank and the app tells you when you&rsquo;d get there instead.
        </p>

        {state.error && <ErrorNote>{state.error}</ErrorNote>}

        <div className="mt-3">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Saving…' : initial ? 'Save goal' : 'Set goal'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}

export function ContributionForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState<GoalState, FormData>(
    addContribution,
    {},
  );
  const [direction, setDirection] = useState<'in' | 'out'>('in');

  return (
    <Card className="px-5 py-4">
      <p className="t-heading">Record what you set aside</p>
      <p className="t-caption mt-1 text-fg-secondary">
        Not what you earned &mdash; the app already knows that. This is what survived.
      </p>

      <form action={formAction} className="mt-3">
        <SegmentedControl
          legend="Direction"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'in', label: 'Put aside' },
            { value: 'out', label: 'Took back out' },
          ]}
        />
        <input type="hidden" name="direction" value={direction} />

        <div className="mt-2.5 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="t-caption text-fg-secondary">Amount</span>
            <div className="relative mt-1">
              <span className="t-figure pointer-events-none absolute inset-y-0 left-3 flex items-center text-fg-secondary">
                &euro;
              </span>
              <input
                name="amount"
                inputMode="decimal"
                placeholder="50"
                aria-label="Amount in euro"
                className="t-figure min-h-12 w-full rounded-lg bg-segment-track pl-7 pr-3 tabular-nums outline-none placeholder:font-normal placeholder:text-fg-placeholder"
              />
            </div>
          </label>

          <label className="block">
            <span className="t-caption text-fg-secondary">When</span>
            <input
              type="date"
              name="date"
              defaultValue={today}
              className="t-figure mt-1 min-h-12 w-full rounded-lg bg-segment-track px-2 text-center tabular-nums"
            />
          </label>
        </div>

        <label className="mt-2.5 block">
          <span className="t-caption text-fg-secondary">Note (optional)</span>
          <input
            name="note"
            maxLength={200}
            placeholder="After Friday&rsquo;s shift"
            className="t-body mt-1 min-h-12 w-full rounded-lg bg-segment-track px-3 outline-none placeholder:text-fg-placeholder"
          />
        </label>

        {state.error && <ErrorNote>{state.error}</ErrorNote>}

        <div className="mt-3">
          <PrimaryButton type="submit" disabled={pending}>
            {pending ? 'Saving…' : direction === 'in' ? 'Add contribution' : 'Record withdrawal'}
          </PrimaryButton>
        </div>
      </form>
    </Card>
  );
}
