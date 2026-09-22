import {
  ApiError,
  GoogleGenAI,
  type Content,
  type FunctionDeclaration,
  type Schema,
} from '@google/genai';
import type { Citation, ModelReply, ToolSpec, Turn } from './types';
import { ProviderError, RateLimited } from './types';

/**
 * The provider boundary.
 *
 * This is the only file in the app that imports a model SDK. Everything else
 * — the tool surface, the route, the transcript — speaks the neutral shapes
 * in ./types. Free tiers move, and when this one does, switching should mean
 * rewriting this file and nothing else.
 *
 * Gemini, on the free tier, decided 2026-09-22. The key is server-side only
 * and must never carry a NEXT_PUBLIC_ prefix; it would be in the bundle.
 */

/**
 * Checked against ai.google.dev/gemini-api/docs/models on 2026-09-22, then
 * measured against the real key the same day.
 *
 * Free tier is Flash and Flash-Lite, and the 2.5 generation is documented as
 * restricted to projects that already used it. Flash rather than Flash-Lite
 * because this agent calls tools in a loop, and a weaker model that skips a
 * tool call is the exact failure the architecture exists to prevent.
 *
 * 3.6 rather than 3.5 on evidence, not preference. On 2026-09-22 a plain
 * request to 3.5-flash returned 200, but every request carrying tool
 * declarations returned 503 "experiencing high demand" across repeated
 * attempts, while 3.6-flash completed the full loop — four tool calls and an
 * answer. 3.8-flash was 503 for everything. Congestion moves, so this is a
 * default and not a finding; re-measure with scripts/ask.mjs before changing
 * it.
 *
 * Overridable, so a model change does not need a deploy.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash';

/** Stops a runaway loop from spending a day's free quota in one request. */
const MAX_SEARCHES = 5;

export function hasModelKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
  return new GoogleGenAI({ apiKey });
}

/* -- Schema translation ----------------------------------------------------
   Gemini takes a subset of OpenAPI rather than full JSON Schema: `type` is an
   upper-case enum and `additionalProperties` is not a field it knows. Passing
   either through unchanged is rejected for the whole request, which surfaces
   as every tool silently disappearing. */

const SUPPORTED = new Set([
  'anyOf', 'default', 'description', 'enum', 'example', 'format', 'items',
  'maxItems', 'maxLength', 'maxProperties', 'maximum', 'minItems', 'minLength',
  'minProperties', 'minimum', 'nullable', 'pattern', 'properties',
  'propertyOrdering', 'required', 'title', 'type',
]);

export function toGeminiSchema(node: unknown): Schema {
  if (typeof node !== 'object' || node === null) return {} as Schema;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!SUPPORTED.has(key)) continue;

    if (key === 'type') {
      // JSON Schema writes an optional field as `type: ['string', 'null']`.
      // Gemini has no union type and expresses the same thing as a single
      // type plus `nullable`. Uppercasing the array verbatim yields
      // "STRING,NULL", which is rejected — and a rejected declaration takes
      // every other tool down with it.
      const names = (Array.isArray(value) ? value : [value]).filter(
        (t): t is string => typeof t === 'string',
      );
      const concrete = names.filter((t) => t !== 'null');
      if (names.length > concrete.length) out.nullable = true;
      if (concrete.length > 0) out.type = concrete[0].toUpperCase();
    } else if (key === 'properties' && typeof value === 'object' && value !== null) {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)]),
      );
    } else if (key === 'items') {
      out.items = toGeminiSchema(value);
    } else if (key === 'anyOf' && Array.isArray(value)) {
      out.anyOf = value.map(toGeminiSchema);
    } else {
      out[key] = value;
    }
  }

  return out as Schema;
}

export const toDeclaration = (tool: ToolSpec): FunctionDeclaration => ({
  name: tool.name,
  description: tool.description,
  parameters: toGeminiSchema(tool.input_schema),
});

/* -- Transcript translation ------------------------------------------------
   Gemini has two roles, `user` and `model`, and a tool result is a
   functionResponse part sent back under the user role. Calls carry no id of
   their own, so the name is the correlation key and results are matched on
   it — which is why two calls to the same tool in one turn are sent back in
   the order they were made. */

function toContents(turns: Turn[]): Content[] {
  return turns.map((turn) => ({
    role: turn.role === 'model' ? 'model' : 'user',
    parts: turn.parts.map((part) => {
      if (part.kind === 'text') return { text: part.text };
      if (part.kind === 'call') {
        return {
          functionCall: { name: part.name, args: part.args },
          // Required back verbatim by Gemini 3, or the next request is
          // rejected for the whole conversation.
          ...(part.signature ? { thoughtSignature: part.signature } : {}),
        };
      }
      return {
        functionResponse: {
          name: part.name,
          // Gemini wants an object here; a bare array or scalar is rejected.
          response: { output: part.output },
        },
      };
    }),
  }));
}

/* -- Failure ---------------------------------------------------------------
   The status decides, never the wording.

   This used to regex the message for "quota" or "rate limit" and report a
   friendly "you are rate-limited" for anything that matched — which meant a
   400 for a bad model, or a 403 for an API that was never enabled, both
   arrived as "wait a minute and try again". That is the same failure as
   /auth/error headlining "limited to TCD accounts" whatever had gone wrong:
   a reassuring sentence shown for a reason nobody checked, and it costs
   hours because it sends you to fix the wrong thing.

   So: 429 is the only thing called rate limiting, and every other failure
   carries its real status and the provider's own words.
   ------------------------------------------------------------------------ */

function asProviderError(error: unknown): RateLimited | ProviderError {
  const status = error instanceof ApiError ? error.status : undefined;
  const detail = error instanceof Error ? error.message : String(error);

  // Logged in full, server-side, because the browser gets a summary and the
  // provider's own body is the only thing that says what actually happened.
  console.error('[ai] provider error', { status, model: MODEL, detail });

  if (status === 429) {
    const retry = /retry(?:Delay|-after)"?[:\s]+"?(\d+)/i.exec(detail);
    return new RateLimited(
      'Gemini’s free tier is rate-limited and this went over it. Wait a minute and ask again.',
      retry ? Number(retry[1]) : undefined,
    );
  }

  return new ProviderError(status, MODEL, detail);
}

/* -- The call -------------------------------------------------------------- */

/**
 * One turn of the conversation. Never grounded.
 *
 * Attaching googleSearch is what spends the search quota, not searching.
 * Measured: the prompt "Reply with the word OK." returned 200 plain and 429
 * with grounding attached — no search could possibly have been needed. So
 * grounding every message meant "hi" cost a search, and the allowance was
 * gone before any question that needed one arrived.
 *
 * Search is a tool the model has to ask for instead. Questions answerable
 * from the user's own tables — am I on track, what did I earn — never touch
 * it, which is most of them.
 */
export async function generate({
  system,
  turns,
  tools,
  onText,
}: {
  system: string;
  turns: Turn[];
  tools: ToolSpec[];
  onText: (delta: string) => void;
}): Promise<ModelReply> {
  return attempt({ system, turns, tools, onText, grounded: false });
}

/**
 * One grounded lookup, for a question the user's own data cannot answer.
 *
 * Deliberately its own call: no conversation, no tool declarations, one
 * query. That keeps the search quota tied to the thing that actually needed
 * searching, and returns the sources attached to the claim they support
 * rather than to the whole turn.
 */
export async function webLookup(
  query: string,
): Promise<{ text: string; citations: Citation[]; searched: true }> {
  const citations = new Map<string, Citation>();
  let text = '';

  try {
    const stream = await client().models.generateContentStream({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: query }] }],
      config: {
        systemInstruction:
          'Answer the question with current figures and say where each came from. ' +
          'Be brief. If you cannot find a real figure, say so plainly rather than estimating.',
        tools: [{ googleSearch: {} }],
      },
    });

    for await (const chunk of stream) {
      if (chunk.text) text += chunk.text;
      for (const ref of chunk.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) {
        const uri = ref.web?.uri;
        if (!uri || citations.has(uri)) continue;
        citations.set(uri, {
          title: ref.web?.title ?? uri,
          uri,
          checkedOn: new Date().toISOString().slice(0, 10),
        });
      }
    }
  } catch (error) {
    throw asProviderError(error);
  }

  return { text, citations: [...citations.values()], searched: true };
}

async function attempt({
  system,
  turns,
  tools,
  onText,
  grounded,
}: {
  system: string;
  turns: Turn[];
  tools: ToolSpec[];
  onText: (delta: string) => void;
  grounded: boolean;
}): Promise<ModelReply> {
  const calls: ModelReply['calls'] = [];
  const citations = new Map<string, Citation>();
  let text = '';

  try {
    const stream = await client().models.generateContentStream({
      model: MODEL,
      contents: toContents(turns),
      config: {
        systemInstruction: system,
        tools: [{ functionDeclarations: tools.map(toDeclaration) }],
      },
    });

    let index = 0;
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        onText(delta);
      }

      // Read the raw parts rather than chunk.functionCalls: the convenience
      // accessor returns the call without the thoughtSignature sitting beside
      // it, and the signature is not optional on a replayed call.
      for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (!part.functionCall) continue;
        calls.push({
          // Gemini does not issue call ids, and the route needs a stable
          // handle to pair a result with its card.
          id: `call_${Date.now().toString(36)}_${index++}`,
          name: part.functionCall.name ?? '',
          args: (part.functionCall.args ?? {}) as Record<string, unknown>,
          signature: part.thoughtSignature,
        });
      }

      const grounding = chunk.candidates?.[0]?.groundingMetadata;
      for (const ref of grounding?.groundingChunks ?? []) {
        const uri = ref.web?.uri;
        if (!uri || citations.has(uri)) continue;
        citations.set(uri, {
          title: ref.web?.title ?? uri,
          uri,
          checkedOn: new Date().toISOString().slice(0, 10),
        });
      }
    }
  } catch (error) {
    throw asProviderError(error);
  }

  return { text, calls, citations: [...citations.values()], grounded };
}

export { MAX_SEARCHES, MODEL };
