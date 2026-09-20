'use client';

import { useActionState, useState } from 'react';
import { SegmentedControl } from '@/app/_components/SegmentedControl';
import { Card, ErrorNote, PageHeader, PrimaryButton, Screen } from '@/app/_components/ui';
import { formatCents, parseRateToCents } from '@/lib/pay/money';
import { saveSettings, type SettingsState } from './actions';

type BreaksAnswer = 'unpaid' | 'paid';
type PeriodAnswer = 'weekly' | 'fortnightly' | 'monthly';
type SundayAnswer = 'none' | 'yes' | 'unknown';
type SundayShape = 'per_hour' | 'multiplier';

export interface SettingsInitial {
  rate: string;
  rateCents: number;
  breaks: BreaksAnswer;
  period: PeriodAnswer;
  sunday: SundayAnswer;
  sundayShape: SundayShape;
  sundayValue: string;
}

export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [state, formAction, pending] = useActionState<SettingsState, FormData>(
    saveSettings,
    {},
  );

  const [rate, setRate] = useState(initial.rate);
  const [breaks, setBreaks] = useState<BreaksAnswer>(initial.breaks);
  const [period, setPeriod] = useState<PeriodAnswer>(initial.period);
  const [sunday, setSunday] = useState<SundayAnswer>(initial.sunday);
  const [sundayShape, setSundayShape] = useState<SundayShape>(initial.sundayShape);
  const [sundayValue, setSundayValue] = useState(initial.sundayValue);

  const parsed = parseRateToCents(rate);
  const rateValid = parsed !== null;
  const raised = parsed !== null && parsed > initial.rateCents;
  const cut = parsed !== null && parsed < initial.rateCents;

  return (
    <Screen>
      <PageHeader
        eyebrow="Settings"
        title="Your pay"
        back={{ href: '/', label: 'This period' }}
      />

      <form action={formAction} className="flex flex-1 flex-col">
        <Card className="px-5 py-4">
          <label htmlFor="rate" className="t-caption block text-center text-fg-secondary">
            Hourly rate
          </label>
          <div className="mt-1.5 flex items-baseline justify-center gap-0.5">
            <span className={`t-hero ${rate ? '' : 'text-fg-placeholder'}`} aria-hidden="true">
              &euro;
            </span>
            <input
              id="rate"
              name="rate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder="0.00"
              aria-label="Hourly rate in euro"
              className="t-hero w-[5ch] bg-transparent text-left tabular-nums outline-none placeholder:text-fg-placeholder"
            />
          </div>

          {/* The pay-rise guarantee, stated where the rise is actually made.
              Shifts carry the rate they were worked at, so nothing already
              logged moves. */}
          {(raised || cut) && (
            <p className="t-caption mt-2.5 text-center text-attention">
              {raised ? 'Pay rise' : 'Rate reduced'} from{' '}
              {formatCents(initial.rateCents)}. Shifts already logged keep the rate
              they were worked at &mdash; only new ones use this.
            </p>
          )}
          {!raised && !cut && (
            <p className="t-caption mt-2.5 text-center text-fg-secondary">
              Before tax. Changing this never re-prices shifts already logged.
            </p>
          )}
        </Card>

        <Card className="mt-3 divide-y divide-separator">
          <Row question="Are your breaks paid?">
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
            note="“Not sure” is stored differently from “No”, and it is the only answer that lets the app flag a possible entitlement."
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
                    value={sundayValue}
                    onChange={(e) => setSundayValue(e.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder={sundayShape === 'multiplier' ? '1.5' : '2.00'}
                    aria-label={
                      sundayShape === 'multiplier'
                        ? 'Sunday rate multiplier'
                        : 'Extra euro per hour on Sundays'
                    }
                    className="t-figure min-h-11 w-24 shrink-0 rounded-lg bg-segment-track px-3 text-center tabular-nums outline-none placeholder:font-normal placeholder:text-fg-placeholder"
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
        </Card>

        {state.error && <ErrorNote>{state.error}</ErrorNote>}

        <div className="mt-auto pt-6">
          <PrimaryButton type="submit" disabled={!rateValid || pending}>
            {pending ? 'Saving…' : 'Save'}
          </PrimaryButton>
        </div>
      </form>
    </Screen>
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
    <div className="px-5 py-3.5">
      <p className="t-heading">{question}</p>
      {note && <p className="t-caption mt-1 text-fg-secondary">{note}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}
