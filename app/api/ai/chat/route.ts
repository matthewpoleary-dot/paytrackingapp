import { createClient } from '@/lib/supabase/server';
import { buildSystemPrompt, runTool, TOOLS } from '@/lib/ai/tools';
import { generate, hasModelKey } from '@/lib/ai/client';
import { RateLimited, type Part, type Turn } from '@/lib/ai/types';

export const maxDuration = 120;

/** Enough for a plan that needs several lookups; short enough to end. */
const MAX_TURNS = 12;

/**
 * The chat endpoint.
 *
 * Server-side only: the API key never reaches the browser, and every tool
 * runs here with the user's own Supabase session so RLS scopes the reads.
 *
 * Streams newline-delimited JSON rather than a provider's own event stream.
 * The client needs six things — text, a tool starting, a tool result,
 * citations, done, an error — and translating here keeps both the rendering
 * code small and the provider swappable.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorised', { status: 401 });

  if (!hasModelKey()) {
    return new Response(
      'GEMINI_API_KEY is not set. Add it to .env.local — server-side, never NEXT_PUBLIC_.',
      { status: 500 },
    );
  }

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

  // Replay the thread so the model has the history. Parts are stored in the
  // neutral shape, so a provider change does not strand the transcript.
  const { data: history } = await supabase
    .from('ai_message')
    .select('role, content')
    .eq('conversation_id', threadId)
    .order('created_at', { ascending: true });

  const turns: Turn[] = (history ?? []).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: m.content as Part[],
  }));

  const userParts: Part[] = [{ kind: 'text', text: message }];
  turns.push({ role: 'user', parts: userParts });
  await supabase
    .from('ai_message')
    .insert({ user_id: user.id, conversation_id: threadId, role: 'user', content: userParts });

  const system = await buildSystemPrompt();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        send({ type: 'conversation', id: threadId });

        // The agentic loop. Runs until the model stops asking for tools.
        for (let turn = 0; turn < MAX_TURNS; turn++) {
          const reply = await generate({
            system,
            turns,
            tools: TOOLS,
            onText: (text) => send({ type: 'text', text }),
          });

          const modelParts: Part[] = [];
          if (reply.text) modelParts.push({ kind: 'text', text: reply.text });
          for (const call of reply.calls) {
            modelParts.push({ kind: 'call', id: call.id, name: call.name, args: call.args });
          }

          // A turn with nothing in it would replay as an empty message and be
          // rejected on the next request.
          if (modelParts.length > 0) {
            await supabase.from('ai_message').insert({
              user_id: user.id,
              conversation_id: threadId,
              role: 'assistant',
              content: modelParts,
            });
            turns.push({ role: 'model', parts: modelParts });
          }

          // Sources the model actually read, with the date checked, so a
          // figure about the outside world can be stored with its citation.
          if (reply.citations.length > 0) send({ type: 'citations', citations: reply.citations });

          if (reply.calls.length === 0) break;

          const results: Part[] = [];
          for (const call of reply.calls) {
            send({ type: 'tool', name: call.name });
            const output = await runTool(call.name, call.args);
            send({ type: 'tool_result', name: call.name, id: call.id, output });
            results.push({ kind: 'result', id: call.id, name: call.name, output });
          }

          await supabase.from('ai_message').insert({
            user_id: user.id,
            conversation_id: threadId,
            role: 'user',
            content: results,
          });
          turns.push({ role: 'user', parts: results });
        }

        await supabase
          .from('conversation')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', threadId);

        send({ type: 'done' });
      } catch (error) {
        // A quota error that reaches the user as a stalled spinner is
        // indistinguishable from the app being broken, so it says what it is.
        if (error instanceof RateLimited) {
          send({
            type: 'error',
            kind: 'rate_limit',
            message: error.message,
            retryAfterSeconds: error.retryAfterSeconds,
          });
        } else {
          send({
            type: 'error',
            message: error instanceof Error ? error.message : 'Something went wrong',
          });
        }
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
