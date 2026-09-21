import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { buildSystemPrompt, runTool, TOOLS } from '@/lib/ai/tools';

export const maxDuration = 120;

/**
 * The chat endpoint.
 *
 * Server-side only: the API key never reaches the browser, and every tool
 * runs here with the user's own Supabase session so RLS scopes the reads.
 *
 * Streams newline-delimited JSON rather than the SDK's raw event stream —
 * the client only needs four things (text, a tool starting, a tool result,
 * done), and translating here keeps the rendering code small.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorised', { status: 401 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response('ANTHROPIC_API_KEY is not set', { status: 500 });

  const { conversationId, message } = (await request.json()) as {
    conversationId?: string;
    message: string;
  };
  if (!message?.trim()) return new Response('Empty message', { status: 400 });

  // --- Conversation ---------------------------------------------------------
  let threadId = conversationId;
  if (!threadId) {
    const { data } = await supabase
      .from('conversation')
      .insert({ user_id: user.id, title: message.slice(0, 80) })
      .select('id')
      .single();
    threadId = data?.id;
  }
  if (!threadId) return new Response('Could not start a conversation', { status: 500 });

  // Replay the thread so the model has the history. The full content blocks
  // are stored, so tool uses and results replay exactly as they happened.
  const { data: history } = await supabase
    .from('ai_message')
    .select('role, content')
    .eq('conversation_id', threadId)
    .order('created_at', { ascending: true });

  const messages: Anthropic.MessageParam[] = (history ?? []).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content as Anthropic.ContentBlockParam[],
  }));

  const userBlocks: Anthropic.ContentBlockParam[] = [{ type: 'text', text: message }];
  messages.push({ role: 'user', content: userBlocks });
  await supabase
    .from('ai_message')
    .insert({ user_id: user.id, conversation_id: threadId, role: 'user', content: userBlocks });

  const anthropic = new Anthropic({ apiKey });
  const system = await buildSystemPrompt();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        send({ type: 'conversation', id: threadId });

        // The agentic loop. Runs until the model stops asking for tools.
        for (let turn = 0; turn < 12; turn++) {
          const assistantBlocks: Anthropic.ContentBlockParam[] = [];

          const response = anthropic.messages.stream({
            model: 'claude-opus-5',
            max_tokens: 4096,
            // Adaptive: the model decides how much to think, so a "what did I
            // earn" question stays fast while planning a budget can take its
            // time.
            thinking: { type: 'adaptive' },
            system,
            tools: [
              ...TOOLS,
              // Without this the model answers "what's rent in Bologna" from
              // memory, which is the same failure as inventing a pay rule.
              {
                type: 'web_search_20250305',
                name: 'web_search',
                max_uses: 5,
              } as unknown as Anthropic.Tool,
            ],
            messages,
          });

          response.on('text', (delta) => send({ type: 'text', text: delta }));

          const final = await response.finalMessage();
          assistantBlocks.push(...(final.content as Anthropic.ContentBlockParam[]));

          await supabase.from('ai_message').insert({
            user_id: user.id,
            conversation_id: threadId,
            role: 'assistant',
            content: assistantBlocks,
          });
          messages.push({ role: 'assistant', content: assistantBlocks });

          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );
          if (toolUses.length === 0) break;

          const results: Anthropic.ContentBlockParam[] = [];
          for (const use of toolUses) {
            send({ type: 'tool', name: use.name });
            const output = await runTool(use.name, use.input as Record<string, unknown>);
            send({ type: 'tool_result', name: use.name, id: use.id, output });
            results.push({
              type: 'tool_result',
              tool_use_id: use.id,
              content: JSON.stringify(output),
            });
          }

          await supabase.from('ai_message').insert({
            user_id: user.id,
            conversation_id: threadId,
            role: 'user',
            content: results,
          });
          messages.push({ role: 'user', content: results });
        }

        await supabase
          .from('conversation')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', threadId);

        send({ type: 'done' });
      } catch (error) {
        send({
          type: 'error',
          message: error instanceof Error ? error.message : 'Something went wrong',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
