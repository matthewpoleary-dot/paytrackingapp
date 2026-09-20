'use client';

import { useActionState, useState } from 'react';
import { SegmentedControl } from '@/app/_components/SegmentedControl';
import { parseRateToCents } from '@/lib/pay/money';
import { saveSetup, type SetupState } from './actions';

type BreaksAnswer = 'unpaid' | 'paid';
type PeriodAnswer = 'weekly' | 'fortnightly' | 'monthly';
type SundayAnswer = 'none' | 'yes' | 'unknown';
type SundayShape = 'per_hour' | 'multiplier';

export default function SetupPage() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(
    saveSetup,
    {},
  );

  const [rate, setRate] = useState('');

  // Breaks defaults to unpaid, and that direction is deliberate. Guess
  // "unpaid" and the app asks about breaks it may not need to — recoverable.
  // Guess "paid" and it never asks again, so the break data is gone for good.
  const [breaks, setBreaks] = useState<BreaksAnswer>('unpaid');
  const [period, setPeriod] = useState<PeriodAnswer>('weekly');

  // Not sure, until told. Stored as NULL, which is not the same as "no".
  const [sunday, setSunday] = useState<SundayAnswer>('unknown');
  const [sundayShape, setSundayShape] = useState<SundayShape>('per_hour');

  const rateValid = parseRateToCents(rate) !== null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(2rem,env(safe-area-inset-top))]">
      <header className="mb-5">
        <p className="t-label text-fg-secondary">Once only</p>
        <h1 className="t-title mt-1 text-balance">
          Four questions, then you&rsquo;re logging shifts.
        </h1>
      </header>

      <form action={formAction} className="flex flex-1 flex-col">
        {/* -- The rate. The hero, because it is the number everything else
               is derived from. ------------------------------------------- */}
        <section className="rounded-2xl bg-surface-raised px-5 py-4 shadow-[var(--shadow-card)]">
          <label
            htmlFor="rate"
            className="t-caption block text-center text-fg-secondary"
          >
            What do you earn an hour?
          </label>
          <div className="mt-1.5 flex items-baseline justify-center gap-0.5">
            {/* The euro sign only firms up once there is a rate to attach it
                to. An empty field must not read as a rate of zero. */}
            <span
              className={`t-hero ${rate ? 'text-fg' : 'text-fg-placeholder'}`}
              aria-hidden="true"
            >
              &euro;
            </span>
            <input
              id="rate"
              name="rate"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0.00"
              aria-label="Hourly rate in euro"
              className="t-hero w-[5ch] bg-transparent text-left tabular-nums outline-none placeholder:font-semibold placeholder:text-fg-placeholder"
            />
          </div>
          <p className="t-caption mt-1.5 text-center text-fg-secondary">
            Before tax. This app deals in gross pay only.
          </p>
        </section>

        {/* -- The other three, as one grouped list. -------------------- */}
        <section className="mt-3 overflow-hidden rounded-2xl bg-surface-raised shadow-[var(--shadow-card)]">
          <Row
            question="Are your breaks paid?"
            note="Irish law gives no right to paid breaks, so only your contract can say."
          >
            <SegmentedControl
              legend="Are your breaks paid?"
              value={breaks}
              onChange={setBreaks}
              options={[
                { value: 'paid', label: 'Paid' },
                { value: 'unpaid', label: 'Unpaid' },
              ]}
            />
            <input type="hidden" name="breaks" value={breaks} />
          </Row>

          <Row question="How often are you paid?">
            <SegmentedControl
              legend="How often are you paid?"
              value={period}
              onChange={setPeriod}
              options={[
                { value: 'weekly', label: 'Weekly' },
                { value: 'fortnightly', label: 'Fortnightly' },
                { value: 'monthly', label: 'Monthly' },
              ]}
            />
            <input type="hidden" name="period" value={period} />
          </Row>

          <Row
            question="Paid extra on Sundays?"
            note="Plenty of contracts fold Sunday into the basic rate. If you don’t know, say so — that’s a useful answer."
          >
            <SegmentedControl
              legend="Paid extra on Sundays?"
              value={sunday}
              onChange={setSunday}
              options={[
                { value: 'none', label: 'No' },
                { value: 'yes', label: 'Yes' },
                { value: 'unknown', label: 'Not sure' },
              ]}
            />
            <input type="hidden" name="sunday" value={sunday} />

            {/* Revealed only on "Yes", so the common path stays three taps and
                the detail sits one level deeper. Stacked rather than inline:
                at 390px the two controls side by side wrap their labels. */}
            {sunday === 'yes' && (
              <div className="mt-2">
                <SegmentedControl
                  legend="Sunday premium shape"
                  value={sundayShape}
                  onChange={setSundayShape}
                  options={[
                    { value: 'per_hour', label: 'Extra per hour' },
                    { value: 'multiplier', label: 'Times my rate' },
                  ]}
                />
                <div className="mt-2 flex items-center gap-2.5">
                  <input
                    name="sundayValue"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={sundayShape === 'multiplier' ? '1.5' : '2.00'}
                    aria-label={
                      sundayShape === 'multiplier'
                        ? 'Sunday rate multiplier'
                        : 'Extra euro per hour on Sundays'
                    }
                    className="t-figure min-h-11 w-24 shrink-0 rounded-xl bg-segment-track px-3 text-center tabular-nums outline-none placeholder:font-normal placeholder:text-fg-placeholder"
                  />
                  <span className="t-caption text-fg-secondary">
                    {sundayShape === 'multiplier'
                      ? '× my hourly rate, on Sundays'
                      : 'extra per hour, on Sundays'}
                  </span>
                </div>
                <input type="hidden" name="sundayShape" value={sundayShape} />
              </div>
            )}
          </Row>
        </section>

        {state.error && (
          <p
            role="alert"
            className="t-caption mt-4 rounded-xl bg-surface-raised px-4 py-3 text-critical"
          >
            {state.error}
          </p>
        )}

        <div className="mt-auto pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="submit"
            disabled={!rateValid || pending}
            className="min-h-[3.25rem] w-full rounded-2xl bg-accent px-5 font-semibold text-accent-fg transition-[opacity,transform] duration-150 active:scale-[0.985] disabled:opacity-35"
          >
            {pending ? 'Saving…' : 'Start logging shifts'}
          </button>
          <p className="t-caption mt-2.5 text-center text-fg-secondary">
            All of this is changeable later, including your rate when it goes up.
          </p>
        </div>
      </form>
    </main>
  );
}

function Row({
  question,
  note,
  children,
}: {
  question: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-separator px-5 py-3.5 last:border-b-0">
      <p className="t-heading">{question}</p>
      {note && (
        <p className="t-caption mt-1 text-fg-secondary">{note}</p>
      )}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
