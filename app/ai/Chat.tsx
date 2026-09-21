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

interface Turn {
  role: 'user' | 'assistant';
  text: string;
  /** Tool names as they ran, so the user can see what it actually looked at. */
  tools: string[];
  proposals: Proposal[];
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

const OPENERS = [
  'How am I doing for Erasmus?',
  'What will I have saved by August?',
  'How much is rent in Bologna?',
  'Where is my money going?',
];

export function Chat({
  initialTurns,
  conversationId,
}: {
  initialTurns: Turn[];
  conversationId: string | null;
}) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [thread, setThread] = useState<string | null>(conversationId);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
      { role: 'user', text, tools: [], proposals: [] },
      { role: 'assistant', text: '', tools: [], proposals: [] },
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
            next[next.length - 1] = last;
            return next;
          });
          if (event.type === 'conversation') setThread(event.id);
          if (event.type === 'error') setError(event.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  const empty = turns.length === 0;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex-1 space-y-3">
        {empty && (
          <Card className="px-5 py-5">
            <p className="t-heading">Ask about your money</p>
            <p className="t-caption mt-1 text-fg-secondary">
              It can see your roster, your rate, your goal and your spending &mdash; so it
              answers with your numbers, not general advice. Every figure comes from the
              app&rsquo;s own arithmetic.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {OPENERS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => void send(o)}
                  className="t-caption min-h-9 rounded-lg bg-segment-track px-3 text-fg-secondary transition-transform duration-150 active:scale-95"
                >
                  {o}
                </button>
              ))}
            </div>
          </Card>
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
            </div>
          ),
        )}

        {busy && turns[turns.length - 1]?.text === '' && (
          <p className="t-caption px-1 text-fg-tertiary">Thinking&hellip;</p>
        )}

        {error && (
          <p role="alert" className="t-caption rounded-xl bg-surface-raised px-4 py-3 text-critical">
            {error}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="sticky bottom-0 mt-4 flex gap-2 bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your money"
          enterKeyHint="send"
          className="t-body min-h-12 flex-1 rounded-xl bg-surface-raised px-4 outline-none placeholder:text-fg-placeholder"
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
