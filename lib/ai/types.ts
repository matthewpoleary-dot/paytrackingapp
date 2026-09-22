/**
 * The provider-neutral shapes.
 *
 * Nothing here mentions a model vendor. `lib/ai/client.ts` is the only file
 * allowed to import an SDK, and it translates between these types and
 * whatever the current provider wants. Free tiers move constantly, so
 * switching has to cost one file — that only holds if the tool surface, the
 * transcript and the route all speak a shape the provider does not own.
 */

/** A tool the model may call. JSON Schema, translated per provider. */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

/** One call the model asked for. */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * A source the model actually read, from the search tool's grounding data.
 *
 * Any figure about the outside world — rent in a city, a flight, a grant
 * rate — has to carry one of these with the date it was checked, exactly as
 * docs/PAY-RULES.md does for pay law. Unsourced means the line is a guess and
 * has to say so.
 */
export interface Citation {
  title: string;
  uri: string;
  checkedOn: string;
}

/** One turn of the transcript, as stored and replayed. */
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'call'; id: string; name: string; args: Record<string, unknown> }
  | { kind: 'result'; id: string; name: string; output: unknown };

export interface Turn {
  role: 'user' | 'model';
  parts: Part[];
}

/** What one round trip to the model produced. */
export interface ModelReply {
  text: string;
  calls: ToolCall[];
  citations: Citation[];
}

/**
 * The free tier is measured in single-digit requests per minute, so this is
 * an ordinary condition rather than an exceptional one. It gets its own type
 * so the route can say what happened instead of showing a spinner that never
 * resolves.
 */
/**
 * Anything the provider rejected that is not a quota problem.
 *
 * It carries the real HTTP status and the provider's own words, because the
 * alternative — a reassuring sentence chosen for a reason nobody checked —
 * is what made "rate limited" mean "a 400 for a model that does not exist"
 * and cost an evening. A 400 usually means the model ID or the request
 * shape; a 403 usually means the API is not enabled for the project or the
 * key is restricted. Saying which is the whole job.
 */
export class ProviderError extends Error {
  readonly status?: number;
  readonly model: string;
  readonly detail: string;

  constructor(status: number | undefined, model: string, detail: string) {
    super(
      status
        ? `The model provider returned ${status} for ${model}.`
        : `The model provider could not be reached for ${model}.`,
    );
    this.name = 'ProviderError';
    this.status = status;
    this.model = model;
    this.detail = detail;
  }
}

export class RateLimited extends Error {
  readonly retryAfterSeconds?: number;
  constructor(message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'RateLimited';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
