import { redirect } from 'next/navigation';
import { getContributions, getGoal, getSettings } from '@/lib/db/queries';
import { project } from '@/lib/pay/projection';
import { formatCents } from '@/lib/pay/money';
import { dublinDate } from '@/lib/time/dublin';
import {
  Card,
  Empty,
  Group,
  GroupRow,
  Money,
  PageHeader,
  Screen,
} from '@/app/_components/ui';
import { ContributionForm, GoalForm } from './GoalForms';
import { deleteContribution } from './actions';

const DAY = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DAY.format(new Date(Date.UTC(y, m - 1, d)));
}

export default async function GoalPage() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const today = dublinDate();
  const [goal, contributions] = await Promise.all([getGoal(), getContributions()]);
  const p = goal ? project(goal, contributions, today) : null;

  return (
    <Screen>
      <PageHeader
        eyebrow="Savings goal"
        title={goal ? goal.name : 'What are you saving for?'}
        back={{ href: '/', label: 'Dashboard' }}
      />

      {goal && p && (
        <Card className="mb-3 px-6 py-6">
          <p className="t-caption text-fg-secondary">
            {p.reached ? 'Target reached' : 'Set aside so far'}
          </p>
          <p className="mt-2">
            <Money cents={p.savedCents} estimated={false} size="hero" />
          </p>
          <p className="t-caption mt-2 text-fg-secondary">
            of {formatCents(p.targetCents)}
            {goal.target_date && ` by ${formatDay(goal.target_date)}`}
          </p>

          {/* Progress. A single measure, so no legend and no axis — the
              number above already states it; this just gives it a shape. */}
          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/15"
            role="img"
            aria-label={`${Math.round(p.progress * 100)} percent of target`}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${Math.max(p.progress * 100, p.savedCents > 0 ? 2 : 0)}%` }}
            />
          </div>

          <p className="t-caption mt-3 text-fg-secondary">
            {p.reached
              ? 'Nothing left to save. Set a new target whenever you like.'
              : `${formatCents(p.remainingCents)} to go`}
          </p>
        </Card>
      )}

      {goal && p && !p.reached && (
        <Card className="mb-3 px-5 py-4">
          <p className="t-label text-fg-secondary">Projection</p>
          {p.reason ? (
            <p className="t-caption mt-1.5 text-fg-secondary">{p.reason}</p>
          ) : (
            <>
              <p className="t-figure mt-1.5">
                {formatDay(p.projectedDate!)}
                <span className="t-caption text-fg-secondary">
                  {' · about '}
                  {p.weeksRemaining} more week{p.weeksRemaining === 1 ? '' : 's'}
                </span>
              </p>
              <p className="t-caption mt-1.5 text-fg-secondary">
                Arithmetic only: {formatCents(p.perWeekCents!)} a week is what you have
                actually been setting aside, carried forward. It assumes nothing about
                shifts you have not worked.
              </p>
              {p.behindTarget && (
                <p className="t-caption mt-2 text-attention">
                  That lands after {formatDay(goal.target_date!)}. You would need to put
                  more aside each week to hit the date.
                </p>
              )}
            </>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <GoalForm
          initial={
            goal
              ? {
                  name: goal.name,
                  target: (goal.target_cents / 100).toFixed(2).replace(/\.00$/, ''),
                  targetDate: goal.target_date ?? '',
                }
              : null
          }
        />

        {goal && <ContributionForm today={today} />}
      </div>

      {contributions.length > 0 && (
        <section className="mt-6">
          <p className="t-label mb-2 px-1 text-fg-secondary">History</p>
          <Card>
            <Group>
              {[...contributions].reverse().map((c) => (
                <GroupRow key={c.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-heading tabular-nums">
                      {c.amount_cents < 0 ? '−' : ''}
                      {formatCents(Math.abs(c.amount_cents))}
                    </p>
                    <p className="t-caption mt-0.5 text-fg-secondary">
                      {formatDay(c.contributed_on)}
                      {c.note && ` · ${c.note}`}
                    </p>
                  </div>
                  <form action={deleteContribution}>
                    <input type="hidden" name="id" value={c.id} />
                    <button
                      type="submit"
                      aria-label="Delete this entry"
                      className="t-caption min-h-11 px-2 text-fg-tertiary"
                    >
                      Remove
                    </button>
                  </form>
                </GroupRow>
              ))}
            </Group>
          </Card>
        </section>
      )}

      {!goal && contributions.length === 0 && (
        <div className="mt-3">
          <Empty title="Nothing recorded yet">
            Earnings are already tracked. This is for what you actually keep.
          </Empty>
        </div>
      )}

      <div className="h-8" />
    </Screen>
  );
}
