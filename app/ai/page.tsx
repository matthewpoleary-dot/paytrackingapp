import { redirect } from 'next/navigation';
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
}

/**
 * Rebuilds the visible thread from stored content blocks.
 *
 * The transcript holds the full blocks, so a proposal card re-renders from
 * the tool result that produced it — which is why there is no proposal
 * table. Tool-result messages are stored with role 'user' (that is how the
 * Messages API carries them), so they are folded into the assistant turn
 * they belong to rather than shown as something the user said.
 */
function rebuild(
  rows: { role: string; content: unknown }[],
): { turns: Turn[] } {
  const turns: Turn[] = [];

  for (const row of rows) {
    const blocks = Array.isArray(row.content) ? row.content : [];
    const isToolResults = blocks.some(
      (b: Record<string, unknown>) => b?.type === 'tool_result',
    );

    if (row.role === 'user' && !isToolResults) {
      const text = blocks
        .filter((b: Record<string, unknown>) => b?.type === 'text')
        .map((b: Record<string, unknown>) => String(b.text ?? ''))
        .join('');
      if (text) turns.push({ role: 'user', text, tools: [], proposals: [] });
      continue;
    }

    if (row.role === 'user' && isToolResults) {
      const last = turns[turns.length - 1];
      if (!last || last.role !== 'assistant') continue;
      for (const block of blocks) {
        if (block?.type !== 'tool_result') continue;
        try {
          const parsed = JSON.parse(String(block.content));
          if (parsed?.proposal) last.proposals.push(parsed);
        } catch {
          // A tool result that is not JSON is not a proposal. Nothing to show.
        }
      }
      continue;
    }

    // Assistant turn.
    const text = blocks
      .filter((b: Record<string, unknown>) => b?.type === 'text')
      .map((b: Record<string, unknown>) => String(b.text ?? ''))
      .join('');
    const tools = blocks
      .filter((b: Record<string, unknown>) => b?.type === 'tool_use')
      .map((b: Record<string, unknown>) => String(b.name ?? ''));

    const previous = turns[turns.length - 1];
    if (previous?.role === 'assistant' && previous.text === '') {
      // Continuation of the same answer after a tool round trip.
      previous.text += text;
      previous.tools.push(...tools);
    } else {
      turns.push({ role: 'assistant', text, tools, proposals: [] });
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
