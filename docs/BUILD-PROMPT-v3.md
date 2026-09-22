# v3 build prompt

Paste into Claude Code from the repo root, or say: *read
`docs/BUILD-PROMPT-v3.md` and build it.*

---

Read `CLAUDE.md` and `docs/PAY-RULES.md` before anything else. They are the
brief. Where this file contradicts them it is because a decision was
overturned on 2026-09-21 — those are listed explicitly below and nowhere
else. Everything they say that isn't listed still holds.

## What v3 is

Tally stops being a pay calculator and becomes a savings hub for one
part-time worker saving for Erasmus. Three tabs: **Shifts** (what exists
today), **Budget** (new), **AI** (new).

The whole thing is in service of one sentence the app must always be able
to say:

> €4,200 by August. You're at €1,150. At the rate you're setting aside you
> land in October — six weeks late. Six extra Sundays closes it.

Shifts say what's coming in. Budget says what's going out. The goal is the
deadline. The AI keeps that sentence current. **A feature that doesn't feed
that sentence isn't in v3.**

## The bar for the AI tab

`CLAUDE.md` says the competitor for shift entry is the Notes app. The
competitor for the AI tab is **claude.ai itself**. If the user would get a
better answer by opening claude.ai and typing, this tab has failed.

It wins only by knowing things claude.ai cannot: their roster, their rate,
their goal, their spending. So **the tool surface is the build and the chat
box is the easy part.** Do not spend the session polishing a chat UI over a
thin tool surface — that is the failure mode this paragraph exists to
prevent.

## Decisions already made — do not relitigate

Settled 2026-09-21. Three overturn rules in `CLAUDE.md`; they are marked.

1. **Google sign-in replaces anonymous sessions.** *Overturns the "no auth
   screen in v1, anonymous session" rule.* Anonymous was device-bound, and
   this app now holds 18 months of pay and savings history. The Google
   Cloud client and Supabase provider are already configured. Consent
   screen is **Internal** (TCD Workspace), so only `@tcd.ie` accounts can
   sign in.
2. **Clean slate.** There is no data worth preserving. Existing anonymous
   rows may be deleted. Do not build a migration path for them.
3. **CSV import of the user's own statements is in.** *Overturns "no
   payslip parsing, no bank integration."* Revolut CSV export only,
   hardcoded to that format. **No OCR, no PDF parsing, no open banking, no
   aggregator.**
4. **The AI proposes; the user confirms.** Every write it makes is a card
   the user taps. It never writes silently.
5. **Web search is on, via Gemini's Google Search grounding.** Without it
   the model answers "what's rent in Bologna" from memory, which is the same
   failure as inventing a Sunday multiplier. With it, the figure carries a
   citation that gets stored. Grounding is included in the free tier (5,000
   grounded prompts a month on 3.x models), so no separate search API and no
   second key.
6. **The savings goal becomes a cost breakdown**, not a single number.
   Lines, each with an amount and a confidence: `quoted` (you have a
   booking), `researched` (found with a citation), `guess`. The target is
   the sum. It improves as real numbers arrive.
7. **Streaks are out.** Rejected: the weekly ritual is the cadence, and a
   daily counter on a data-entry chore rewards fabricated entries, which
   would destroy the log's value as evidence.

## The rule that governs the AI

**The model narrates. The code calculates.**

Every euro figure the AI states must come back from a tool that computed it
in `lib/pay` or `lib/budget`. The model must never total a list of
transactions, pro-rata a monthly figure, or work out weeks-to-target
itself. Rule 4 in `CLAUDE.md` exists because Claude asserted a pay figure
from memory once already in this project; an AI inventing a budget number
is the same bug wearing a different hat.

Corollary: any figure about the outside world — rent in a city, a flight
price, an Erasmus+ grant rate — needs a `web_search` citation stored
alongside it, with the date checked, exactly as `docs/PAY-RULES.md` does.
If the model can't source it, the line is a `guess` and says so.

## Memory is the schema, not the transcript

"Remembers me" means durable facts live in rows the rest of the app can
compute with — destination, departure month, rent, the buffer the user
won't dip below. A transcript nobody can query is not memory. The
conversation is stored too, but it is the log, not the state.

## Build order

**1. Record the decisions.** Add a dated v3 section to `CLAUDE.md` marking
the three overturned rules. Do this first so the rest of the session has
one source of truth.

**2. The migration — one file, forward-only.** Highest-stakes step.
**Stop here and show it before applying.**

Same conventions as the two existing migrations, without exception: integer
cents, integer minutes, `user_id` on every table, RLS `enable`d **and**
`force`d, policies for all four verbs, `auth.uid()` in a subselect.

- `goal_line` — `goal_id`, `label`, `amount_cents`, `confidence`
  (`quoted` | `researched` | `guess`), `source_url`, `source_checked_on`,
  `sort_order`. The breakdown behind the target.
- `outgoing` — recurring money out: `label`, `amount_cents`, `cadence`
  (`weekly` | `fortnightly` | `monthly` | `yearly`), `category`,
  `started_on`, `ended_on` nullable. Ending an outgoing must not delete the
  history that it existed.
- `txn` — transactions: `posted_on`, `description`, `amount_cents`
  (**signed**, like `contribution`), `category`, `source`
  (`manual` | `revolut_csv`), `external_id`, `categorised_by`
  (`user` | `model`). Unique index on `(user_id, source, external_id)`
  where `external_id` is not null — re-importing the same statement must
  not double-count. Copy the shape `contribution` already uses.
- `spend_category` enum — a fixed set so the model has a closed
  vocabulary to target. Include a `transfer` value: moving money to savings
  is not spending, and counting it as such would make every good month look
  like a bad one.
- `profile_fact` — durable memory: `key`, `value`, `learned_on`,
  `confirmed_at`, `source` (`user` | `model`). Unconfirmed model-written
  facts are visible and deletable by the user.
- `conversation` and `ai_message` — `role`, `content` as jsonb (keep the
  full content blocks, not just text), `created_at`.

No proposal table. A proposal is a tool result already stored in
`ai_message.content`; the card re-renders from the transcript and confirming
calls an ordinary server action.

**3. Extend `tests/rls.test.mjs`** to every new table. Per `CLAUDE.md` rule
5 and the README: follow `supabase/verify-rls-test.sql` to open a
deliberate hole and **watch the new tests go red** before trusting them. A
green run you never saw fail proves nothing.

**4. Google sign-in.** Sign-in screen, `/auth/callback`, sign-out. Remove
`signInAnonymously` from `lib/supabase/proxy.ts` and gate routes on a real
session. Write the console steps into `docs/SETUP.md` — they were worked
out by hand and will otherwise be lost. Note the graduation cliff as a
follow-up: the account is keyed to a TCD identity, and Supabase identity
linking is the eventual fix.

**5. `lib/budget`.** Normalise outgoings to a period, spending by category
over a window, and the cashflow figure tying rostered earnings to outgoings
and the goal. Integer cents; round per item and sum the rounded parts, the
same rule `lib/pay` follows, for the same reason: rows that don't add up to
their total destroy the app's credibility.

**6. The AI tool surface.** The heart of the build.

Read tools: pay snapshot for a period, upcoming rostered shifts, goal with
its lines and projection, spending by category, outgoings, profile facts,
and the cashflow figure. Each returns computed numbers.

Propose-only write tools: `propose_goal_line`, `propose_outgoing`,
`propose_profile_fact`, `propose_txn_category`. They return a proposal; they
do not write.

Plus Google Search grounding, so external figures arrive with a citation
that gets stored on the row.

**Provider: Google Gemini, on the free tier.** Decided 2026-09-22 on cost.
Read the two constraints below before writing any of it.

- **Put the provider behind one module — `lib/ai/client.ts`.** Nothing else
  in the app imports the SDK. The tool definitions, the propose-and-confirm
  flow, the schema and the narrate-don't-calculate rule are all
  provider-agnostic and must stay that way. Free tiers are the most volatile
  part of this stack: in the last few months Cerebras became a paid trial,
  GitHub Models shut down, Groq dropped Llama from its free plan, and
  OpenRouter's free models went paid. Switching providers must cost one file.
- **Server-side only.** The key is read in server actions and route
  handlers, never a client component.

Mechanics: SDK is `@google/genai` (**not** the older
`@google/generative-ai`). Pin `<3.0.0` unless the project is on Node 22+ —
3.0.0 raised the floor. Function calling uses `parametersJsonSchema` on the
declarations. Stream the response.

**Do not hardcode a model ID from memory.** Only Flash and Flash-Lite are on
the free tier — Pro was removed from it in April 2026. Check
`ai.google.dev` for the current Flash model and use that. Rule 4's
discipline applies to model IDs as much as to pay rates.

The system prompt states the narrate-don't-calculate rule and that
unsourced external figures are `guess`es.

Ask before adding `@google/genai` — it is the one new runtime dependency
and the working agreement requires asking. (It is expected; ask anyway.)

Free-tier limits to design against, not discover: roughly 5–15 requests per
minute and about 1,000 requests a day. Fine for one person, but handle a 429
with a message that says what happened rather than a spinner that never
resolves.

**7. The AI tab.** Streaming chat at 390px, persisted conversation,
proposal cards that write only on a tap. Goal setup is a conversation: the
user says "Bologna in September" and it works through destination, dates,
rent, flights and deposit, proposing lines with their sources.

**8. The Budget tab and CSV import.** Outgoings as the backbone,
transactions and spending by category on top. Revolut CSV parser, idempotent
on re-import. **Plain edit screens for everything the AI can propose** — a
conversation is a terrible way to fix a typo in €4,200.

**9. Navigation and screenshots.** Three tabs replacing the ad-hoc
dashboard links. Then screenshot every screen at 390×844 in both schemes,
look at them, and fix what's wrong before calling it done.

## Rules for this session

- **Rule 1 is live.** Impeccable for structure. Do not load
  `emil-design-eng` or `animate` in the same turn as `impeccable`. Motion
  comes after the static design settles.
- **Rule 3 is live.** The Budget tab has charts. Load `dataviz` *before*
  the first line of chart code, not after a draft exists.
- **Rule 2 is live.** 390×844 before anything is called done.
- **Never invent a figure.** Pay rules come from `docs/PAY-RULES.md`; its
  "not yet researched" list means stop and ask, not fill from memory. The
  same standard now applies to every number the AI surfaces.
- Flat. No shadows. Large text light and tight, never bold. Brass means
  *not settled yet* and nothing else. Money is never accent-coloured.
- Migrations are forward-only. Never edit an applied one.

## Out of v3

Holiday tab. Payslip parsing, OCR, open banking. Multi-user sharing beyond
the RLS that already exists. Streaks. PAYE/USC/PRSI. Identity linking for
the graduation cliff — noted, not built.

---

**Stop after step 2 and show the migration before applying it.**
