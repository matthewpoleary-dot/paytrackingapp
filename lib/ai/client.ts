import { GoogleGenAI, type Content, type FunctionDeclaration, type Schema } from '@google/genai';
import type { Citation, ModelReply, ToolSpec, Turn } from './types';
import { RateLimited } from './types';

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
 * Checked against ai.google.dev/gemini-api/docs/models on 2026-09-22.
 *
 * Free tier is Flash and Flash-Lite. `gemini-3.5-flash` is the stable
 * general Flash; the 2.5 generation is documented as restricted to projects
 * that already used it, so a new key cannot rely on it. Flash rather than
 * Flash-Lite because this agent calls tools in a loop and a weaker model
 * that skips a tool call is the exact failure this architecture exists to
 * prevent.
 *
 * Overridable, so a model change does not need a deploy.
 */
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash';

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
        return { functionCall: { name: part.name, args: part.args } };
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
   The free tier allows single-digit requests per minute, so exhausting it is
   ordinary. It must say so: a quota error that reaches the user as a stalled
   spinner is indistinguishable from the app being broken. */

function asRateLimit(error: unknown): RateLimited | null {
  const status = (error as { status?: number })?.status;
  const text = error instanceof Error ? error.message : String(error);
  const looksLikeQuota = /rate limit|quota|RESOURCE_EXHAUSTED|too many requests/i.test(text);
  if (status !== 429 && !looksLikeQuota) return null;

  const retry = /retry(?:Delay|-after)"?[:\s]+"?(\d+)/i.exec(text);
  return new RateLimited(
    'The free Gemini tier is rate-limited and this request went over it. Wait a minute and ask again.',
    retry ? Number(retry[1]) : undefined,
  );
}

/* -- The call -------------------------------------------------------------- */

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
  const calls: ModelReply['calls'] = [];
  const citations = new Map<string, Citation>();
  let text = '';

  try {
    const stream = await client().models.generateContentStream({
      model: MODEL,
      contents: toContents(turns),
      config: {
        systemInstruction: system,
        tools: [
          { functionDeclarations: tools.map(toDeclaration) },
          // Without search the model answers "what is rent in Bologna" from
          // memory, which is the same failure as inventing a pay rule. Google
          // Search grounding is included on the free tier.
          { googleSearch: {} },
        ],
      },
    });

    let index = 0;
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        onText(delta);
      }

      for (const call of chunk.functionCalls ?? []) {
        calls.push({
          // Gemini does not issue call ids, and the route needs a stable
          // handle to pair a result with its card.
          id: `call_${Date.now().toString(36)}_${index++}`,
          name: call.name ?? '',
          args: (call.args ?? {}) as Record<string, unknown>,
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
    const limited = asRateLimit(error);
    if (limited) throw limited;
    throw error;
  }

  return { text, calls, citations: [...citations.values()] };
}

export { MAX_SEARCHES, MODEL };
