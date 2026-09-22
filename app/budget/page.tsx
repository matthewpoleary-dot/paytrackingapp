import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  getContributions,
  getGoal,
  getGoalLines,
  getOutgoings,
  getSettings,
  getShiftsBetween,
  getTxns,
} from '@/lib/db/queries';
import { aggregate } from '@/lib/pay/aggregate';
import { formatCents, sumCents } from '@/lib/pay/money';
import {
  cashflow,
  goalArrival,
  goalTarget,
  outgoingPerWeek,
  shiftsToClose,
  spendingByCategory,
} from '@/lib/budget/calc';
import { CATEGORY_LABEL } from '@/lib/budget/types';
import { valueShift } from '@/lib/pay/calc';
import { addDays, dublinDate } from '@/lib/time/dublin';
import { Card, Group, GroupRow, Money, Screen, Panel } from '@/app/_components/ui';
import { TabBar } from '@/app/_components/TabBar';
import { CsvImport, GoalLineForm, OutgoingForm } from './BudgetForms';
import { endOutgoing } from './actions';

const CONFIDENCE_LABEL = { quoted: 'Booked', researched: 'Looked up', guess: 'A guess' } as const;

export default async function BudgetPage() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const today = dublinDate();
  const from = addDays(today, -27);

  const [goal, outgoings, txns, shifts, contributions] = await Promise.all([
    getGoal(),
    getOutgoings(),
    getTxns(from, today),
    getShiftsBetween(from, today),
    getContributions(),
  ]);

  const lines = goal ? await getGoalLines(goal.id) : [];
  const target = goalTarget(lines);
  const saved = sumCents(contributions.map((c) => c.amount_cents));

  const earned = aggregate(shifts, settings);
  const flow = cashflow(earned.cents, outgoings, txns, from, today);
  const spending = spendingByCategory(txns, from, today);
  const peakSpend = Math.max(1, ...spending.map((s) => s.cents));

  const live = outgoings.filter((o) => o.ended_on === null);
  const committedPerWeek = sumCents(live.map(outgoingPerWeek));

  // The rate is what has actually been set aside, never what was earned:
  // what you earn and what you keep are different numbers.
  const dates = contributions.map((c) => c.contributed_on).sort();
  const weeksCovered =
    dates.length < 2
      ? null
      : Math.max(
          1,
          (Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) -
            Date.parse(`${dates[0]}T00:00:00Z`)) /
            (7 * 86_400_000),
        );
  const perWeek = weeksCovered === null ? null : Math.round(saved / weeksCovered);
  const arrival = goalArrival(target.cents, saved, perWeek, today, goal?.target_date ?? null);

  const typicalShift =
    shifts.length === 0
      ? 0
      : Math.round(sumCents(shifts.map((s) => valueShift(s, settings).cents)) / shifts.length);
  const extraShifts =
    arrival.weeksLate !== null && perWeek !== null
      ? shiftsToClose(arrival.weeksLate * perWeek, typicalShift)
      : null;

  return (
    <Screen>
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <h1 className="t-title">Budget</h1>
        <Link href="/goal" className="t-caption -mr-2 inline-flex min-h-11 items-center px-2 text-fg-secondary">
          Contributions
        </Link>
      </header>

      {/* -- The sentence the app exists to say. -------------------------- */}
      <Panel className="px-6 py-6">
        {goal && target.cents > 0 ? (
          <>
            <p className="t-caption text-fg-secondary">
              {goal.name}
              {goal.target_date && ` by ${goal.target_date.slice(0, 7)}`}
            </p>
            <p className="mt-2">
              <Money cents={target.cents} estimated={target.weakest !== 'quoted'} size="hero" />
            </p>
            <p className="t-caption mt-2.5 text-fg-secondary">
              You&rsquo;re at {formatCents(saved)}
              {arrival.arrivesOn && ` · on track for ${arrival.arrivesOn}`}
            </p>
            {arrival.weeksLate !== null && (
              <p className="t-caption mt-2 text-attention">
                {arrival.weeksLate} week{arrival.weeksLate === 1 ? '' : 's'} late
                {extraShifts ? ` — ${extraShifts} more shift${extraShifts === 1 ? '' : 's'} closes it` : ''}
              </p>
            )}
            {arrival.reason && <p className="t-caption mt-2 text-fg-secondary">{arrival.reason}</p>}
          </>
        ) : (
          <>
            <p className="t-caption text-fg-secondary">No target yet</p>
            <p className="t-body mt-2 opacity-90">
              Add what the trip will cost, line by line. The target is the sum.
            </p>
          </>
        )}
      </Panel>

      {/* -- What the goal is made of. ------------------------------------ */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">What it costs</p>
        {lines.length > 0 && (
          <Card className="mb-2">
            <Group>
              {lines.map((l) => (
                <GroupRow key={l.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-heading">{l.label}</p>
                    <p className="t-caption mt-0.5 text-fg-secondary">
                      {l.confidence === 'guess' ? (
                        <span className="text-attention">{CONFIDENCE_LABEL.guess}</span>
                      ) : l.confidence === 'researched' && l.source_url ? (
                        <>
                          {CONFIDENCE_LABEL.researched} &middot;{' '}
                          <a
                            href={l.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            source
                          </a>
                          {l.source_checked_on && ` · ${l.source_checked_on}`}
                        </>
                      ) : (
                        CONFIDENCE_LABEL[l.confidence]
                      )}
                    </p>
                  </div>
                  <Money cents={l.amount_cents} estimated={l.confidence === 'guess'} />
                </GroupRow>
              ))}
            </Group>
          </Card>
        )}
        {goal ? (
          <GoalLineForm />
        ) : (
          <Card className="px-5 py-4">
            <p className="t-caption text-fg-secondary">
              Set a goal first, then add what it costs.
            </p>
            <Link href="/goal" className="t-caption mt-2 inline-flex min-h-11 items-center underline">
              Set a goal
            </Link>
          </Card>
        )}
      </section>

      {/* -- Cashflow over the last four weeks. ---------------------------- */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">Last four weeks</p>
        <Card>
          <Group>
            <GroupRow className="flex items-center justify-between gap-3">
              <p className="t-heading">Earned</p>
              <Money cents={flow.earningsCents} estimated={earned.estimated} />
            </GroupRow>
            <GroupRow className="flex items-center justify-between gap-3">
              <p className="t-heading">Committed out</p>
              <span className="t-figure tabular-nums">
                &minus;{formatCents(flow.outgoingsCents)}
              </span>
            </GroupRow>
            <GroupRow className="flex items-center justify-between gap-3">
              <p className="t-heading">Spent</p>
              <span className="t-figure tabular-nums">
                &minus;{formatCents(flow.spendingCents)}
              </span>
            </GroupRow>
            <GroupRow className="flex items-center justify-between gap-3">
              <div>
                <p className="t-heading">Left over</p>
                <p className="t-caption mt-0.5 text-fg-secondary">
                  {formatCents(flow.perWeekCents)} a week
                </p>
              </div>
              <Money cents={flow.surplusCents} estimated={earned.estimated} />
            </GroupRow>
          </Group>
        </Card>
      </section>

      {/* -- Spending by category. -----------------------------------------
           Horizontal bars in one hue with the category as text. The palette
           validator fails on a categorical set at these surfaces, so colour
           cannot carry identity here — the label does, and colour is left to
           mean magnitude only. */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">Where it went</p>
        <Card className="px-5 py-4">
          {spending.length === 0 ? (
            <p className="t-caption py-4 text-center text-fg-secondary">
              No spending recorded yet. Import a statement below.
            </p>
          ) : (
            <figure className="m-0 space-y-2.5">
              {spending.map((s) => (
                <div key={s.category}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="t-caption">{CATEGORY_LABEL[s.category]}</span>
                    <span className="t-caption tabular-nums text-fg-secondary">
                      {formatCents(s.cents)}
                    </span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-segment-track">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.max(2, (s.cents / peakSpend) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <figcaption className="sr-only">
                Spending by category over the last four weeks.
                <table>
                  <tbody>
                    {spending.map((s) => (
                      <tr key={s.category}>
                        <td>{CATEGORY_LABEL[s.category]}</td>
                        <td>{formatCents(s.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figcaption>
            </figure>
          )}
        </Card>
      </section>

      {/* -- Outgoings. ----------------------------------------------------- */}
      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <p className="t-label text-fg-secondary">Committed</p>
          <p className="t-caption text-fg-secondary tabular-nums">
            {formatCents(committedPerWeek)}/wk
          </p>
        </div>
        {live.length > 0 && (
          <Card className="mb-2">
            <Group>
              {live.map((o) => (
                <GroupRow key={o.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-heading">{o.label}</p>
                    <p className="t-caption mt-0.5 text-fg-secondary">
                      {formatCents(o.amount_cents)} {o.cadence} &middot;{' '}
                      {CATEGORY_LABEL[o.category]}
                    </p>
                  </div>
                  <form action={endOutgoing}>
                    <input type="hidden" name="id" value={o.id} />
                    <button type="submit" className="t-caption min-h-11 px-2 text-fg-tertiary">
                      End
                    </button>
                  </form>
                </GroupRow>
              ))}
            </Group>
          </Card>
        )}
        <OutgoingForm />
      </section>

      {/* -- Import. --------------------------------------------------------- */}
      <section className="mt-6">
        <p className="t-label mb-2 px-1 text-fg-secondary">Transactions</p>
        <CsvImport />
        {txns.length > 0 && (
          <p className="t-caption mt-2 px-1 text-fg-secondary">
            {txns.length} in the last four weeks.
          </p>
        )}
      </section>

      <TabBar active="budget" />
    </Screen>
  );
}
