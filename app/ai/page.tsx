import { redirect } from 'next/navigation';
import type { Part } from '@/lib/ai/types';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/db/queries';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { Screen } from '@/app/_components/ui';
import { TabBar } from '@/app/_components/TabBar';
import { Chat } from './Chat';

interface Turn {
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

export default async function AiPage() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  let turns: Turn[] = [];
  let conversationId: string | null = null;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: conversation } = await supabase
      .from('conversation')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conversation) {
      conversationId = conversation.id;
      const { data: rows } = await supabase
        .from('ai_message')
        .select('role, content')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true });
      turns = rebuild(rows ?? []).turns;
    }
  }

  return (
    <Screen>
      <header className="mb-4">
        <h1 className="t-title">Ask</h1>
      </header>

      <Chat initialTurns={turns} conversationId={conversationId} />

      <TabBar active="ai" />
    </Screen>
  );
}
