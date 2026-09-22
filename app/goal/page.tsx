import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  getContributions,
  getGoal,
  getGoalLines,
  getSettings,
  getShiftsBetween,
} from '@/lib/db/queries';
import { aggregate } from '@/lib/pay/aggregate';
import { valueShift } from '@/lib/pay/calc';
import { formatCents, sumCents } from '@/lib/pay/money';
import { goalStanding, goalTarget } from '@/lib/budget/calc';
import { addDays, dublinDate } from '@/lib/time/dublin';
import {
  Card,
  Group,
  GroupRow,
  PageHeader,
  Screen,
} from '@/app/_components/ui';
import { TabBar } from '@/app/_components/TabBar';
import { Chat } from '@/app/ai/Chat';
import { rebuildTurns } from '@/app/ai/transcript';
import { CsvImport } from '@/app/budget/BudgetForms';
import { ContributionForm, GoalForm } from './GoalForms';
import { Standing } from './Standing';
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

/**
 * The savings goal, and the assistant that lives in it.
 *
 * The Ask used to be a separate tab you had to remember to visit, and this
 * screen was a form. Both were wrong. The goal is the only thing in the app
 * with an open question attached to it — am I going to make it — and an
 * assistant with nothing to be about is a chat box.
 *
 * So the order is: what the answer is right now, then the assistant that can
 * change it, then the inputs it works from.
 *
 * The figures are computed here, by lib/budget, before the model sees
 * anything. It can explain them, revise the plan around them and propose
 * rows, but it never produces them. Every write it makes is still a card the
 * user taps.
 */
export default async function GoalPage() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const today = dublinDate();
  const [goal, contributions] = await Promise.all([getGoal(), getContributions()]);

  // Lines beat the headline figure: once the cost is itemised, the target is
  // the sum of the lines and the single number the user typed is a fallback.
  const lines = goal ? await getGoalLines(goal.id) : [];
  const fromLines = goalTarget(lines);
  const targetCents = fromLines.cents > 0 ? fromLines.cents : (goal?.target_cents ?? 0);

  // A typical shift, for "how many more would close the gap".
  const recent = await getShiftsBetween(addDays(today, -27), today);
  const typicalShiftCents =
    recent.length === 0
      ? 0
      : Math.round(sumCents(recent.map((s) => valueShift(s, settings).cents)) / recent.length);

  const standing = goalStanding({
    targetCents,
    contributions,
    today,
    deadline: goal?.target_date ?? null,
    typicalShiftCents,
  });

  const earned = aggregate(recent, settings);
  const { turns, conversationId } = await latestThread();

  return (
    <Screen>
      <PageHeader
        title={goal ? goal.name : 'What are you saving for?'}
        back={{ href: '/', label: 'Shifts' }}
      />

      {goal && targetCents > 0 ? (
        <>
          {/* The answer, before anyone asks for it. */}
          <Standing
            name={goal.name}
            targetCents={targetCents}
            deadline={goal.target_date}
            figures={standing}
          />

          <div
            className="mt-4 h-2 w-full overflow-hidden rounded-full bg-segment-track"
            role="img"
            aria-label={`${Math.round((standing.savedCents / targetCents) * 100)} percent of target`}
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{
                width: `${Math.min(100, Math.max((standing.savedCents / targetCents) * 100, standing.savedCents > 0 ? 2 : 0))}%`,
              }}
            />
          </div>

          {fromLines.cents > 0 && (
            <p className="t-caption mt-2 text-fg-tertiary">
              Target is the sum of {lines.length} line{lines.length === 1 ? '' : 's'}
              {fromLines.weakest !== 'quoted' && ` · weakest is a ${fromLines.weakest}`}
            </p>
          )}
        </>
      ) : (
        // No Empty here: the form directly below says "Set a goal" and means
        // it. Two blocks announcing the same absence is the screen repeating
        // itself.
        <p className="t-body max-w-[42ch] text-fg-secondary">
          Name what you are saving for and what it costs. Everything below works from
          that.
        </p>
      )}

      {/* With no goal there is nothing to plan for, so the form leads.
          With one, the answer leads and the form becomes maintenance. */}
      {!goal && (
        <section className="mt-8">
          <GoalForm initial={null} />
        </section>
      )}

      {/* -- The assistant, on the thing it is about. --------------------- */}
      <section className="mt-8">
        <h2 className="t-heading">Work it out</h2>
        <p className="t-caption mt-1 max-w-[46ch] text-fg-secondary">
          It can see your shifts, your outgoings and what you have actually set aside.
          Every figure it gives you is calculated, not guessed — and it asks before it
          changes anything.
        </p>

        <div className="mt-4">
          <Chat
            initialTurns={turns}
            conversationId={conversationId}
            openers={
              goal
                ? [
                    'Am I on track?',
                    'Where is my money going?',
                    'What if I pick up another shift?',
                    `What would it take to hit ${goal.name}?`,
                  ]
                : ['What should I be saving?', 'Where is my money going?']
            }
            placeholder={goal ? `Ask about ${goal.name}` : 'Ask about your money'}
            intro={false}
            embedded
          />
        </div>
      </section>

      {/* -- Maintenance: editing the goal, recording what went aside. ---- */}
      {goal && (
        <section className="mt-10 space-y-3">
          <h2 className="t-heading">The goal</h2>
          <GoalForm
            initial={{
              name: goal.name,
              // Escaped: an unescaped dot here matches any character, so a
              // target of 3000.00 came back as "30" in the edit field.
              target: (goal.target_cents / 100).toFixed(2).replace(/\.00$/, ''),
              targetDate: goal.target_date ?? '',
            }}
          />
          <ContributionForm today={today} />
        </section>
      )}

      <section className="mt-10">
        <h2 className="t-heading">What it works from</h2>
        <p className="t-caption mt-1 max-w-[46ch] text-fg-secondary">
          {earned.shiftCount > 0
            ? `${formatCents(earned.cents)} earned in the last four weeks, across ${earned.shiftCount} shift${earned.shiftCount === 1 ? '' : 's'}.`
            : 'No shifts in the last four weeks yet.'}{' '}
          Import a statement and it can see the spending too.
        </p>

        <div className="mt-4">
          <CsvImport />
        </div>
      </section>

      {contributions.length > 0 && (
        <section className="mt-10">
          <h2 className="t-heading mb-3">What you have put aside</h2>
          <Card>
            <Group>
              {[...contributions].reverse().map((c) => (
                <GroupRow key={c.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-figure tabular-nums">
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

      <TabBar active="budget" />
    </Screen>
  );
}

/** The running conversation, so returning continues rather than restarts. */
async function latestThread() {
  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from('conversation')
    .select('id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conversation) return { turns: [], conversationId: null };

  const { data: rows } = await supabase
    .from('ai_message')
    .select('role, content')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true });

  return { turns: rebuildTurns(rows ?? []), conversationId: conversation.id as string };
}
