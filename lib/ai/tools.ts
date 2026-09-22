import {
  getGoal,
  getGoalLines,
  getOutgoings,
  getProfileFacts,
  getSettings,
  getShiftsBetween,
  getTxns,
  periodContaining,
} from '@/lib/db/queries';
import { aggregate } from '@/lib/pay/aggregate';
import { valueShift } from '@/lib/pay/calc';
import { formatCents, sumCents } from '@/lib/pay/money';
import { getContributions } from '@/lib/db/queries';
import { webLookup } from './client';
import {
  cashflow,
  goalStanding,
  goalTarget,
  outgoingPerWeek,
  shiftsToClose,
  spendingByCategory,
} from '@/lib/budget/calc';
import { addDays, dublinDate } from '@/lib/time/dublin';

/**
 * The tool surface.
 *
 * This file is the product. The chat box is the easy part — what makes this
 * tab worth opening instead of claude.ai is that the model can see this
 * user's roster, rate, goal and spending. If a question can be answered
 * without one of these, the answer belongs on claude.ai.
 *
 * THE RULE: the model narrates, the code calculates. Every euro figure the
 * model says must have come back from one of these handlers, each of which
 * delegates to lib/pay or lib/budget. The model never totals a list, never
 * pro-ratas a monthly figure, never works out weeks-to-target. CLAUDE.md
 * rule 4 exists because Claude asserted a pay figure from memory once in
 * this project already; an AI inventing a budget number is the same bug in a
 * different hat.
 *
 * Every write tool is PROPOSE-ONLY. It returns a proposal for the user to
 * tap; it touches no rows. The server action behind the card does the write.
 */


/** Formats cents for the model, so it never has to divide by 100 itself. */
const money = (cents: number) => ({ cents, formatted: formatCents(cents) });

export { TOOLS } from './schema';

/** A propose_* result. The card in the transcript renders straight from this. */
export interface Proposal {
  proposal: true;
  kind: 'goal_line' | 'outgoing' | 'profile_fact' | 'txn_category';
  /** Rendered by the card; also what the confirm action writes. */
  payload: Record<string, unknown>;
  reasoning: string;
  /** Spelled out so the model cannot claim in prose that it saved something. */
  saved: false;
  note: string;
}

const proposal = (
  kind: Proposal['kind'],
  payload: Record<string, unknown>,
  reasoning: string,
): Proposal => ({
  proposal: true,
  kind,
  payload,
  reasoning,
  saved: false,
  note: 'Nothing has been written. The user must tap this card to save it.',
});

/**
 * Runs a tool and returns a plain object for the model.
 *
 * Reads run as the signed-in user, so RLS scopes them — there is no user_id
 * filter anywhere below, deliberately.
 */
export async function runTool(name: string, input: Record<string, unknown>): Promise<unknown> {
  const today = dublinDate();
  const settings = await getSettings();
  if (!settings) return { error: 'The user has not finished setup yet, so there is no pay rate.' };

  switch (name) {
    case 'get_pay_snapshot': {
      const from = String(input.from);
      const to = String(input.to);
      const shifts = await getShiftsBetween(from, to);
      const a = aggregate(shifts, settings);
      return {
        window: { from, to },
        earned: money(a.cents),
        confirmed: money(a.confirmedCents),
        still_estimated: money(a.estimatedCents),
        shifts: a.shiftCount,
        confirmed_shifts: a.confirmedCount,
        paid_minutes: a.paidMinutes,
        is_estimate: a.estimated,
        worked_sunday_without_premium: a.sundayWithoutPremium,
        caveat: a.estimated
          ? 'Some shifts are not confirmed, so this figure is an estimate. Say so.'
          : null,
      };
    }

    case 'get_upcoming_shifts': {
      const to = addDays(today, Number(input.days_ahead));
      const shifts = await getShiftsBetween(today, to);
      return {
        window: { from: today, to },
        shifts: shifts.map((s) => ({
          id: s.id,
          date: s.work_date,
          worth: money(valueShift(s, settings).cents),
          confirmed: s.actuals_confirmed_at !== null,
        })),
        total: money(aggregate(shifts, settings).cents),
      };
    }

    case 'get_goal': {
      const goal = await getGoal();
      if (!goal) return { goal: null, note: 'No goal set yet.' };

      const [lines, contributions] = await Promise.all([
        getGoalLines(goal.id),
        getContributions(),
      ]);
      const target = goalTarget(lines);

      // Same rule as the goal screen: itemised lines beat the headline
      // figure, and the number the user typed is the fallback. Using only
      // the lines reported a target of €0 to the model while the screen
      // showed €4,200 — the same figure disagreeing across two surfaces,
      // which is the exact thing goalStanding exists to stop.
      const targetCents = target.cents > 0 ? target.cents : goal.target_cents;

      const standing = goalStanding({
        targetCents,
        contributions,
        today,
        deadline: goal.target_date,
        typicalShiftCents: 0,
      });
      const saved = standing.savedCents;
      const perWeek = standing.perWeekCents;
      const arrival = standing.arrival;
      const typicalShift = Math.round(
        (await getShiftsBetween(addDays(today, -56), today))
          .map((s) => valueShift(s, settings).cents)
          .reduce((a, b, _, arr) => a + b / arr.length, 0) || 0,
      );

      return {
        name: goal.name,
        deadline: goal.target_date,
        target: money(targetCents),
        target_from: target.cents > 0 ? 'lines' : 'headline figure',
        target_confidence: target.cents > 0 ? target.weakest : null,
        breakdown: lines.map((l) => ({
          id: l.id,
          label: l.label,
          amount: money(l.amount_cents),
          confidence: l.confidence,
          source_url: l.source_url,
          source_checked_on: l.source_checked_on,
        })),
        split_by_confidence: {
          quoted: money(target.quotedCents),
          researched: money(target.researchedCents),
          guess: money(target.guessCents),
        },
        saved: money(saved),
        remaining: money(arrival.remainingCents),
        setting_aside_per_week: perWeek === null ? null : money(perWeek),
        arrives_on: arrival.arrivesOn,
        weeks_remaining: arrival.weeksRemaining,
        weeks_late: arrival.weeksLate,
        extra_shifts_to_close_the_gap:
          arrival.weeksLate === null || perWeek === null
            ? null
            : shiftsToClose(arrival.weeksLate * perWeek, typicalShift),
        typical_shift: money(typicalShift),
        no_projection_because: arrival.reason,
      };
    }

    case 'get_spending': {
      const from = String(input.from);
      const to = String(input.to);
      const txns = await getTxns(from, to);
      const byCategory = spendingByCategory(txns, from, to);
      return {
        window: { from, to },
        total: money(sumCents(byCategory.map((c) => c.cents))),
        by_category: byCategory.map((c) => ({
          category: c.category,
          spent: money(c.cents),
          transactions: c.count,
        })),
        transaction_count: txns.length,
        note:
          txns.length === 0
            ? 'No transactions in this window. The user may not have imported a statement yet.'
            : null,
      };
    }

    case 'get_outgoings': {
      const outgoings = await getOutgoings();
      const live = outgoings.filter((o) => o.ended_on === null);
      return {
        outgoings: outgoings.map((o) => ({
          id: o.id,
          label: o.label,
          amount: money(o.amount_cents),
          cadence: o.cadence,
          category: o.category,
          per_week: money(outgoingPerWeek(o)),
          started_on: o.started_on,
          ended_on: o.ended_on,
          active: o.ended_on === null,
        })),
        committed_per_week: money(sumCents(live.map(outgoingPerWeek))),
      };
    }

    case 'get_cashflow': {
      const from = String(input.from);
      const to = String(input.to);
      const [shifts, outgoings, txns] = await Promise.all([
        getShiftsBetween(from, to),
        getOutgoings(),
        getTxns(from, to),
      ]);
      const earned = aggregate(shifts, settings);
      const c = cashflow(earned.cents, outgoings, txns, from, to);
      return {
        window: { from, to, days: c.days },
        earned: money(c.earningsCents),
        earnings_are_estimated: earned.estimated,
        committed_outgoings: money(c.outgoingsCents),
        discretionary_spending: money(c.spendingCents),
        surplus: money(c.surplusCents),
        surplus_per_week: money(c.perWeekCents),
      };
    }

    case 'compare_cost_to_target': {
      const goal = await getGoal();
      if (!goal) return { error: 'No goal set yet, so there is nothing to compare a cost against.' };

      const lines = await getGoalLines(goal.id);
      const fromLines = goalTarget(lines);

      // Same rule as the goal screen: itemised lines beat the headline
      // figure the user typed.
      const targetCents = fromLines.cents > 0 ? fromLines.cents : goal.target_cents;

      const supplied = typeof input.estimated_cents === 'number' ? input.estimated_cents : null;
      const estimatedCents = supplied ?? fromLines.cents;

      if (estimatedCents <= 0) {
        return {
          target: money(targetCents),
          estimated: null,
          verdict: 'no_estimate',
          note: 'Nothing to compare yet. Research the costs or propose goal lines, then call this again.',
        };
      }

      const gapCents = estimatedCents - targetCents;

      return {
        goal: goal.name,
        target: money(targetCents),
        target_from: fromLines.cents > 0 ? 'the saved lines' : 'the figure the user typed',
        estimated: money(estimatedCents),
        estimate_from: supplied === null ? 'the saved lines' : 'your own estimate, not yet saved',
        gap: money(Math.abs(gapCents)),
        verdict:
          gapCents > 0 ? 'target_too_low' : gapCents < 0 ? 'target_covers_it' : 'exact',
        say_this_first:
          gapCents > 0
            ? `Their target of ${formatCents(targetCents)} does not cover this. It looks closer to ${formatCents(estimatedCents)} — ${formatCents(gapCents)} short. Lead with that.`
            : null,
      };
    }

    case 'web_lookup': {
      const query = String(input.query ?? '').trim();
      if (!query) return { error: 'A query is required.' };

      try {
        const found = await webLookup(query);
        return {
          query,
          found: found.text,
          citations: found.citations,
          note:
            found.citations.length > 0
              ? 'Cite these. A figure from here is "researched" and carries its URL and the date checked.'
              : 'Nothing was sourced. Anything you say from this is a guess and must use the word.',
        };
      } catch (error) {
        // A failed search is a tool result, not the end of the turn. The
        // search quota is separate and small, so running out is ordinary —
        // and the app already knows what an unsourced figure is. Killing the
        // whole answer would throw away the parts that came from real data.
        const status = (error as { status?: number })?.status;
        console.warn('[ai] web_lookup failed', { status, query });
        return {
          query,
          found: null,
          searched: false,
          reason:
            status === 429
              ? 'The search quota is spent. It refills; this is not a permanent failure.'
              : 'The lookup failed.',
          note:
            'You could not source this. Do NOT state a figure for it as fact. Either say you could not look it up, or give a number and call it a guess, using that word. Figures from the other tools are unaffected and remain exact.',
        };
      }
    }

    case 'get_profile_facts': {
      const facts = await getProfileFacts();
      return {
        facts: facts.map((f) => ({
          key: f.key,
          value: f.value,
          confirmed: f.confirmed_at !== null,
          source: f.source,
          learned_on: f.learned_on,
        })),
        note: 'Unconfirmed facts were proposed by you and not yet agreed by the user.',
      };
    }

    // --- Propose-only --------------------------------------------------
    case 'propose_goal_line': {
      const confidence = String(input.confidence);
      if (confidence === 'researched' && (!input.source_url || !input.source_checked_on)) {
        return {
          error:
            'A "researched" line needs source_url and source_checked_on. Search for a source, or propose it as a "guess" and say that it is one.',
        };
      }
      return proposal(
        'goal_line',
        {
          label: input.label,
          amount_cents: input.amount_cents,
          confidence,
          source_url: input.source_url ?? null,
          source_checked_on: input.source_checked_on ?? null,
        },
        String(input.reasoning),
      );
    }

    case 'propose_outgoing':
      return proposal(
        'outgoing',
        {
          label: input.label,
          amount_cents: input.amount_cents,
          cadence: input.cadence,
          category: input.category,
          started_on: input.started_on,
        },
        String(input.reasoning),
      );

    case 'propose_profile_fact':
      return proposal(
        'profile_fact',
        { key: input.key, value: input.value },
        String(input.reasoning),
      );

    case 'propose_txn_category':
      return proposal(
        'txn_category',
        { txn_id: input.txn_id, category: input.category },
        String(input.reasoning),
      );

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

/** Context the model gets for free, so it does not burn a turn asking. */
export async function buildSystemPrompt(): Promise<string> {
  const today = dublinDate();
  const settings = await getSettings();
  const facts = await getProfileFacts();
  const goal = await getGoal();
  const period = settings ? periodContaining(today, settings) : null;

  return `You are the assistant inside Tally, a savings app for one part-time worker in Dublin saving for an Erasmus year.

Today is ${today} (Europe/Dublin). ${
    settings
      ? `Their rate is ${formatCents(settings.hourly_rate_cents)}/hr, breaks are ${settings.breaks_paid ? 'paid' : 'unpaid'}, they are paid ${settings.pay_period_length}, and the current pay period is ${period?.startsOn} to ${period?.endsOn}.`
      : 'They have not finished setup yet.'
  }
${goal ? `Their goal is "${goal.name}"${goal.target_date ? `, deadline ${goal.target_date}` : ''}.` : 'They have no goal set yet.'}
${
  facts.length
    ? `What you already know about them:\n${facts.map((f) => `- ${f.key}: ${f.value}${f.confirmed_at ? '' : ' (you proposed this; not yet confirmed)'}`).join('\n')}`
    : 'You know nothing durable about them yet.'
}

THE ONE RULE THAT MATTERS: you narrate, the code calculates.

Every euro figure you state must have come back from a tool in this
conversation. Never total a list of transactions, never pro-rata a monthly
figure onto a week, never work out weeks-to-target, never convert cents to
euro yourself — the tools return a formatted string, use it. If you need a
number you do not have, call a tool. If no tool provides it, say you cannot
work it out rather than estimating.

This app's whole value is being a record its user could stand over. A figure
you invented would destroy that, and it would be indistinguishable from a
real one.

ON FIGURES ABOUT THE OUTSIDE WORLD: rent in a city, a flight price, an
Erasmus+ grant rate — call web_lookup. Do not answer from memory. A figure
you looked up becomes a "researched" goal line carrying its URL and the date
you checked. A figure you could not source is a "guess" and you must say the
word "guess" when you mention it.

web_lookup has a small quota of its own, so it is only for the outside
world. Earnings, shifts, spending, the goal, the rate and the projection all
come from the other tools — never look those up, and never search to be
polite or to confirm something a tool already told you.

WHEN THEY ASK WHAT SOMETHING COSTS: answer in LINES, not a range. A range
cannot improve as real numbers arrive; a breakdown can. Break it into the
parts they will actually pay — flights, rent, deposit, insurance, food,
visa, travel — look up what you can, and propose a goal line for each with
its own amount and confidence. Say a guess is a guess. Four honest lines
beat one confident range.

BEFORE YOU GIVE ANY COST, CALL compare_cost_to_target. If their target does
not cover what you are about to tell them, that comparison is the first
sentence of your answer, not a note at the end. Stating that a trip costs
6,000-8,000 next to a saved target of 3,000, and leaving the user to notice,
is the single worst thing you can do here — noticing it is what this app is
for.

ON WRITING: every propose_* tool returns a card the user taps. You have NOT
saved anything. Never say you have added, saved or recorded something — say
you have suggested it and that they can tap to keep it.

ON ESTIMATES: shifts the user has not confirmed are estimates. When a figure
rests on one, say so. Never present an estimate as settled.

The sentence this app exists to keep current is of this shape:
"€4,200 by August. You're at €1,150. At the rate you're setting aside you
land in October — six weeks late. Six extra Sundays closes it."
Every number in it comes from get_goal. Aim your answers at keeping that
sentence true and current.

Be brief. This is a phone screen. Lead with the number, then the one thing
they could do about it.`;
}
