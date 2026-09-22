import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSettings } from '@/lib/db/queries';
import { hasSupabaseEnv } from '@/lib/supabase/env';
import { Screen } from '@/app/_components/ui';
import { TabBar } from '@/app/_components/TabBar';
import { Chat } from './Chat';
import { rebuildTurns, type Turn } from './transcript';



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
      turns = rebuildTurns(rows ?? []);
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
