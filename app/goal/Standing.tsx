import { formatCents } from '@/lib/pay/money';
import type { Standing as StandingFigures } from '@/lib/budget/calc';

const DAY = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', day: 'numeric', month: 'long' });
const MONTH = new Intl.DateTimeFormat('en-IE', { timeZone: 'UTC', month: 'long' });

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return DAY.format(new Date(Date.UTC(y, m - 1, d)));
};
const month = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return MONTH.format(new Date(Date.UTC(y, m - 1, d)));
};

/**
 * Where the goal stands, without being asked.
 *
 * This is the sentence the app exists to be able to say, and it is stated on
 * arrival rather than waiting for someone to type the question. Coming back
 * to this screen should answer "am I going to make it" before you do
 * anything.
 *
 * Every figure comes from lib/budget. The assistant below can explain any of
 * it and revise the plan around it, but it never computes it — which is why
 * this renders from `goalStanding` and not from a model response.
 */
export function Standing({
  name,
  targetCents,
  deadline,
  figures,
}: {
  name: string;
  targetCents: number;
  deadline: string | null;
  figures: StandingFigures;
}) {
  const { savedCents, arrival, extraShifts } = figures;

  if (arrival.reached) {
    return (
      <p className="t-body max-w-[42ch] text-balance">
        {name} is covered — {formatCents(savedCents)} of {formatCents(targetCents)}. Set a
        new target whenever you like.
      </p>
    );
  }

  return (
    <p className="t-body max-w-[42ch] text-balance">
      <span className="text-fg">
        {formatCents(targetCents)}
        {deadline && ` by ${month(deadline)}`}. You&rsquo;re at {formatCents(savedCents)}.
      </span>{' '}
      <span className="text-fg-secondary">{outlook(figures, deadline, extraShifts)}</span>
    </p>
  );
}

function outlook(
  { arrival, perWeekCents }: StandingFigures,
  deadline: string | null,
  extraShifts: number | null,
): string {
  // No rate yet. Say what is missing rather than inventing a projection.
  if (perWeekCents === null || arrival.arrivesOn === null) {
    return 'Record what you put aside twice and this starts saying when you get there.';
  }

  if (arrival.weeksLate !== null && arrival.weeksLate > 0) {
    const late = `At the rate you’re setting aside you land in ${month(arrival.arrivesOn)} — ${arrival.weeksLate} week${arrival.weeksLate === 1 ? '' : 's'} after ${day(deadline!)}.`;
    return extraShifts === null
      ? late
      : `${late} ${extraShifts} more shift${extraShifts === 1 ? '' : 's'} closes it.`;
  }

  return `At the rate you’re setting aside you get there around ${day(arrival.arrivesOn)}.`;
}
