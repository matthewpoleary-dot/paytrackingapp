import type { Part } from '@/lib/ai/types';

/**
 * The visible thread, rebuilt from stored parts.
 *
 * Shared by the Ask tab and the savings goal, which show the same running
 * conversation from two places. Two copies of this would be two chances for
 * the same transcript to render differently depending on where it was opened.
 */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
  tools: string[];
  proposals: {
    proposal: true;
    kind: 'goal_line' | 'outgoing' | 'profile_fact' | 'txn_category';
    payload: Record<string, unknown>;
    reasoning: string;
  }[];
  citations: never[];
}

/**
 * Rebuilds the visible thread from stored parts.
 *
 * The transcript holds the full parts, so a proposal card re-renders from the
 * tool result that produced it — which is why there is no proposal table.
 * Results are stored under role 'user' (that is how a model API carries them
 * back), so they are folded into the assistant turn they belong to rather
 * than shown as something the user said.
 */
function rebuild(rows: { role: string; content: unknown }[]): { turns: Turn[] } {
  const turns: Turn[] = [];

  for (const row of rows) {
    const parts = (Array.isArray(row.content) ? row.content : []) as Part[];
    const textOf = () =>
      parts
        .filter((p) => p.kind === 'text')
        .map((p) => (p as { text?: string }).text ?? '')
        .join('');

    const isResults = parts.some((p) => p?.kind === 'result');

    if (row.role === 'user' && !isResults) {
      const text = textOf();
      if (text) turns.push({ role: 'user', text, tools: [], proposals: [], citations: [] });
      continue;
    }

    if (row.role === 'user' && isResults) {
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') continue;
      for (const part of parts) {
        if (part.kind !== 'result') continue;
        const output = (part as { output?: unknown }).output as
          | { proposal?: boolean }
          | undefined;
        if (output?.proposal) last.proposals.push(output as Turn['proposals'][number]);
      }
      continue;
    }

    // Assistant turn.
    const text = textOf();
    const tools = parts
      .filter((p) => p.kind === 'call')
      .map((p) => (p as { name?: string }).name ?? '');

    const previous = turns[turns.length - 1];
    if (previous?.role === 'assistant' && previous.text === '') {
      // Continuation of the same answer after a tool round trip.
      previous.text += text;
      previous.tools.push(...tools);
    } else {
      turns.push({ role: 'assistant', text, tools, proposals: [], citations: [] });
    }
  }

  return { turns };
}

export function rebuildTurns(rows: { role: string; content: unknown }[]): Turn[] {
  return rebuild(rows).turns;
}
