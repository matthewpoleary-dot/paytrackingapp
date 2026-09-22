'use client';

import { useEffect, useRef, useState } from 'react';
import { Card } from '@/app/_components/ui';
import { formatCents } from '@/lib/pay/money';
import { confirmProposal } from './actions';

interface Proposal {
  proposal: true;
  kind: 'goal_line' | 'outgoing' | 'profile_fact' | 'txn_category';
  payload: Record<string, unknown>;
  reasoning: string;
}

/**
 * A failure, with whatever the provider actually said.
 *
 * Deliberately not reduced to a friendly sentence. "Rate limited" was shown
 * for every provider error regardless of status, which sent an evening at a
 * quota that was never the problem — the same shape as /auth/error
 * headlining "limited to TCD accounts" whatever had gone wrong.
 */
interface ChatError {
  message: string;
  status?: number;
  model?: string;
  detail?: string;
}

interface Citation {
  title: string;
  uri: string;
  checkedOn: string;
}

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  /** Tool names as they ran, so the user can see what it actually looked at. */
  tools: string[];
  proposals: Proposal[];
  citations: Citation[];
  /** Search was unavailable, so anything about the outside world is a guess. */
  ungrounded: boolean;
}

const TOOL_LABEL: Record<string, string> = {
  get_pay_snapshot: 'Checking your shifts',
  get_upcoming_shifts: 'Looking at what&rsquo;s rostered',
  get_goal: 'Checking your goal',
  get_spending: 'Adding up your spending',
  get_outgoings: 'Checking your outgoings',
  get_cashflow: 'Working out your cashflow',
  get_profile_facts: 'Remembering what you told me',
  web_search: 'Searching the web',
  propose_goal_line: 'Suggesting a goal line',
  propose_outgoing: 'Suggesting an outgoing',
  propose_profile_fact: 'Suggesting something to remember',
  propose_txn_category: 'Suggesting a category',
};

/**
 * Openers, which are not decoration.
 *
 * An empty chat box is the same problem as an empty search box: the user has
 * to guess what it can do. These name the four things it is actually good at,
 * and they are deliberately about this user's own data rather than about the
 * world, because that is the only reason to ask here rather than on
 * claude.ai.
 *
 * Nothing here hardcodes a city or a date. The goal is whatever the user is
 * saving for, so the questions are shaped around the goal, not around a trip
 * somebody once mentioned.
 */
const OPENERS = [
  'Where is my money going?',
  'What will I have saved by then?',
  'Am I on track?',
  'What if I pick up another shift?',
];

export function Chat({
  initialTurns,
  conversationId,
  openers = OPENERS,
  placeholder = 'Ask about your money',
  intro = true,
  embedded = false,
}: {
  initialTurns: Turn[];
  conversationId: string | null;
  /** The surface decides what it is good for; the chat only asks. */
  openers?: string[];
  placeholder?: string;
  /**
   * The Ask tab is nothing but this, so it needs to say what it is. Embedded
   * in the savings goal the surrounding section already does, and two blocks
   * introducing the same box is how a screen starts repeating itself.
   */
  intro?: boolean;
  /**
   * The Ask tab is the whole screen, so it stretches and pins its composer to
   * the bottom. Inside the savings goal it is one section of a page that
   * scrolls past it, where stretching leaves a hole and a pinned composer
   * follows you over unrelated content.
   */
  embedded?: boolean;
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [thread, setThread] = useState<string | null>(conversationId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setError(null);
    setInput('');
    setBusy(true);
    setTurns((t) => [
      ...t,
      { role: 'user', text, tools: [], proposals: [], citations: [], ungrounded: false },
      { role: 'assistant', text: '', tools: [], proposals: [], citations: [], ungrounded: false },
    ]);

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: thread, message: text }),
      });
      if (!response.ok || !response.body) throw new Error(await response.text());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Newline-delimited JSON: a chunk can split an event in half, so the
      // tail stays in the buffer until its newline arrives.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          setTurns((current) => {
            const next = [...current];
            const last = { ...next[next.length - 1] };
            if (event.type === 'text') last.text += event.text;
            if (event.type === 'tool') last.tools = [...last.tools, event.name];
            if (event.type === 'tool_result' && event.output?.proposal) {
              last.proposals = [...last.proposals, event.output as Proposal];
            }
            if (event.type === 'ungrounded') last.ungrounded = true;
            if (event.type === 'citations') {
              // Same source can ground several claims in one answer.
              const seen = new Set(last.citations.map((c) => c.uri));
              last.citations = [
                ...last.citations,
                ...(event.citations as Citation[]).filter((c) => !seen.has(c.uri)),
              ];
            }
            next[next.length - 1] = last;
            return next;
          });
          if (event.type === 'conversation') setThread(event.id);
          if (event.type === 'error') {
            setError({
              message: event.message,
              status: event.status,
              model: event.model,
              detail: event.detail,
            });
          }
        }
      }
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className={embedded ? 'flex flex-col' : 'flex flex-1 flex-col'}>
      <div className="flex-1 space-y-3">
        {empty && (
          <div className={intro ? 'rounded-2xl border border-border px-5 py-5' : ''}>
            {intro && (
              <>
                <p className="t-heading">Ask about your money</p>
                <p className="t-caption mt-1 text-fg-secondary">
                  It can see your roster, your rate, your goal and your spending &mdash; so
                  it answers with your numbers, not general advice. Every figure comes from
                  the app&rsquo;s own arithmetic.
                </p>
              </>
            )}
            <div className={`flex flex-wrap gap-1.5 ${intro ? 'mt-3' : ''}`}>
              {openers.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => void send(o)}
                  className="t-caption inline-flex min-h-11 items-center rounded-lg bg-segment-track px-3 text-fg-secondary transition-transform duration-150 active:scale-95"
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) =>
          turn.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <p className="t-body max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-accent-fg">
                {turn.text}
              </p>
            </div>
          ) : (
            <div key={i} className="space-y-2">
              {turn.tools.length > 0 && (
                <p className="t-caption px-1 text-fg-tertiary">
                  {[...new Set(turn.tools)]
                    .map((t) => TOOL_LABEL[t] ?? t)
                    .join(' · ')
                    .replace(/&rsquo;/g, '’')}
                </p>
              )}
              {turn.text && (
                <p className="t-body whitespace-pre-wrap px-1 text-fg">{turn.text}</p>
              )}
              {turn.proposals.map((p, j) => (
                <ProposalCard key={j} proposal={p} />
              ))}
              {turn.citations.length > 0 && <Sources citations={turn.citations} />}
              {turn.ungrounded && (
                <p className="t-caption px-1 text-attention">
                  Answered without web search &mdash; its quota is spent. Figures from your
                  own data are exact; anything about the outside world is a guess.
                </p>
              )}
            </div>
          ),
        )}

        {busy && turns[turns.length - 1]?.text === '' && (
          <p className="t-caption px-1 text-fg-tertiary">Thinking&hellip;</p>
        )}

        {error && <Failure error={error} />}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className={
          embedded
            ? 'mt-3 flex gap-2'
            : 'sticky bottom-0 mt-4 flex gap-2 bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2'
        }
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={placeholder}
          enterKeyHint="send"
          className="t-body min-h-12 flex-1 rounded-xl bg-segment-track px-4 outline-none placeholder:text-fg-placeholder"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="t-figure flex size-12 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-transform duration-150 active:scale-95 disabled:opacity-35"
        >
          &uarr;
        </button>
      </form>
    </div>
  );
}

/**
 * A proposal, as a card the user taps.
 *
 * The model has written nothing at this point. The card says so, and the
 * button is the only thing that saves.
 */
function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const p = proposal.payload;
  const amount = typeof p.amount_cents === 'number' ? formatCents(p.amount_cents) : null;
  const confidence = typeof p.confidence === 'string' ? p.confidence : null;

  const title =
    proposal.kind === 'goal_line'
      ? `${p.label}`
      : proposal.kind === 'outgoing'
        ? `${p.label}`
        : proposal.kind === 'profile_fact'
          ? `Remember: ${p.key}`
          : 'Recategorise';

  const detail =
    proposal.kind === 'goal_line'
      ? amount
      : proposal.kind === 'outgoing'
        ? `${amount} ${p.cadence}`
        : proposal.kind === 'profile_fact'
          ? String(p.value)
          : String(p.category);

  return (
    <Card className="border border-border px-5 py-4">
      <p className="t-label text-fg-secondary">Suggestion &mdash; not saved</p>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className="t-heading">{title}</p>
        <p className="t-figure tabular-nums">{detail}</p>
      </div>

      {confidence && (
        <p className="t-caption mt-1 text-fg-secondary">
          {confidence === 'guess' ? (
            <span className="text-attention">A guess &mdash; not sourced</span>
          ) : confidence === 'researched' && typeof p.source_url === 'string' ? (
            <>
              Researched &middot;{' '}
              <a
                href={p.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                source
              </a>
              {typeof p.source_checked_on === 'string' && ` &middot; checked ${p.source_checked_on}`}
            </>
          ) : (
            'Quoted'
          )}
        </p>
      )}

      <p className="t-caption mt-2 text-fg-secondary">{proposal.reasoning}</p>

      {state === 'saved' ? (
        <p className="t-caption mt-3 text-positive">Saved.</p>
      ) : (
        <button
          type="button"
          disabled={state === 'saving'}
          onClick={async () => {
            setState('saving');
            const result = await confirmProposal(proposal.kind, proposal.payload);
            if (result.ok) setState('saved');
            else {
              setState('error');
              setMessage(result.error ?? 'Could not save.');
            }
          }}
          className="mt-3 min-h-11 w-full rounded-xl bg-accent font-medium text-accent-fg transition-transform duration-150 active:scale-[0.985] disabled:opacity-40"
        >
          {state === 'saving' ? 'Saving…' : 'Keep this'}
        </button>
      )}

      {state === 'error' && message && (
        <p className="t-caption mt-2 text-critical">{message}</p>
      )}
    </Card>
  );
}

/**
 * Where a figure about the outside world came from.
 *
 * The rule that governs this tab is that the model narrates and the code
 * calculates; anything the code cannot compute — rent in a city, a flight, a
 * grant rate — has to arrive with a source and the date it was checked, the
 * same discipline docs/PAY-RULES.md applies to pay law. Showing them is what
 * lets the user tell a researched number from a guess.
 */
function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className="px-1 pt-1">
      <p className="t-label text-fg-tertiary">Sources</p>
      <ul className="mt-1 space-y-0.5">
        {citations.map((c) => (
          <li key={c.uri}>
            <a
              href={c.uri}
              target="_blank"
              rel="noopener noreferrer"
              className="t-caption inline-flex min-h-11 items-center text-fg-secondary underline"
            >
              {c.title}
              <span className="text-fg-tertiary"> · checked {c.checkedOn}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The real reason, first.
 *
 * The status leads because it is the only part that is reliably true, and
 * the provider's own words go behind a disclosure for whoever is debugging.
 * A 400 is nearly always the model ID or the request shape; a 403 is nearly
 * always the API not being enabled for the project, or a restricted key.
 */
function Failure({ error }: { error: ChatError }) {
  return (
    <div role="alert" className="rounded-xl border border-critical/40 px-4 py-3">
      <p className="t-caption text-critical">{error.message}</p>

      {error.status !== undefined && (
        <p className="t-caption mt-1 text-fg-secondary">
          {error.status === 400 && 'A 400 usually means the model ID is wrong or unavailable to this key.'}
          {error.status === 403 && 'A 403 usually means the Generative Language API is not enabled for the project, or the key is restricted.'}
          {error.status === 404 && 'A 404 usually means the model does not exist under this name.'}
          {error.status === 429 && 'That is a genuine quota limit, not a configuration problem.'}
          {error.status === 503 && 'The model is busy rather than misconfigured. Asking again usually works.'}
        </p>
      )}

      {error.detail && (
        <details className="mt-2">
          <summary className="t-caption inline-flex min-h-11 cursor-pointer list-none items-center text-fg-secondary underline [&::-webkit-details-marker]:hidden">
            What the provider said
          </summary>
          <p className="t-caption whitespace-pre-wrap break-words pb-1 text-fg-tertiary">
            {error.detail}
          </p>
        </details>
      )}
    </div>
  );
}
