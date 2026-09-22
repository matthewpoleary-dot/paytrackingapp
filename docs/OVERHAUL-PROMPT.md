# Overhaul: colour, motion, and the AI's data

Paste into Claude Code, or: *read `docs/OVERHAUL-PROMPT.md` and do it.*

Read `CLAUDE.md` and `docs/DESIGN-AUDIT.md` first.

---

## What this is

Three jobs, in this order, in **separate sessions**. Do not attempt them in
one turn — Part A and Part B load conflicting skills and rule 1 forbids it.

- **Part A — colour and structure.** Impeccable. No motion work.
- **Part B — motion and responsiveness.** `emil-design-eng` and `animate`,
  and only after Part A has settled.
- **Part C — the AI tab's data.** No design skills at all.

The bar for all three: **it must not look or feel generated.** The current
build does. Naming that is not enough to fix it, which is why each part
below says what specifically to change and what to measure.

---

# Part A — colour and structure

**Impeccable only. Do not load `emil-design-eng` or `animate` this session.**

## The deep forest green is being retired

It is the dominant surface today and it is not working. What replaces it is
**not yours to invent** — a session that picks a palette unprompted is how
this got generic in the first place.

### Step 1 — propose, then STOP

Produce **three complete palette directions**. For each one:

- Full token set for both worlds: `--surface`, `--surface-raised`,
  `--surface-sunken`, `--surface-inverse`, `--fg`, `--fg-secondary`,
  `--fg-tertiary`, `--accent`, `--attention`, `--positive`, `--critical`,
  `--separator`, `--border`.
- **A named real-world reference** — a site, a product, a physical object.
  "Warm neutral" is not a reference. `tighsauna.com` was, which is why the
  original direction had a spine.
- **Contrast for every text token against its real surface, alpha
  composited, as a table.** Small text clears 4.5:1 or the direction is
  rejected. Check the script in; do not eyeball it.
- **Rendered on the actual dashboard at 390×844, light and dark**, not on
  swatches. A palette that looks good as a strip and bad as a screen is a
  bad palette.

Then **stop and wait**. Do not implement any of them.

### Constraints that survive the repaint

These are not up for redesign:

- **Flat. No shadows anywhere.** Separation comes from the surface step and
  from space. Grep for `shadow` before you finish; there should be no hits.
- **Large text light and tight, never bold.** Tracking is a function of
  size — roughly -0.055em at display, ~0 at caption.
- **Money is never accent-coloured.** It is already the highest-contrast
  thing on screen.
- **One accent, carrying exactly one meaning: *not settled yet*.** Whatever
  replaces brass inherits that job and nothing else. It must clear 4.5:1,
  because today's brass fails at 4.00 on bone while carrying the app's most
  important signal.
- **Two complete worlds**, light and dark, each designed and each audited.
  The current build audited one and shipped both.

### Step 2 — after the palette is chosen

Apply it, then fix the structural findings in `docs/DESIGN-AUDIT.md`. They
are unchanged by the repaint: card soup, the inverted card spending the
system's strongest move on €0.00, the time-scale jumping between month and
week, two arrow vocabularies, a legend for absent data, and an empty state
that shows four zeroes instead of an invitation.

**A repaint that leaves five equal-weight cards stacked at even spacing has
failed.** The colour was never the main problem.

---

# Part B — motion and responsiveness

**Separate session. `emil-design-eng` and `animate` now. Do not load
Impeccable this turn. Only start once Part A has landed.**

## Two named defects

**1. The Week / Month / Year control is glitchy.**

It should feel like the content is already there and you are moving to it.
Today it reads as a page load. Likely cause: each switch is a server round
trip through `searchParams`, so the whole screen re-renders and blanks.

**2. Log Shifts flashes an empty calendar, then pops in the content.**

That single flash is what makes an app feel amateur, and no amount of
colour work will cover it.

## The rule that fixes both

**Never blank a screen you already have content for.**

- Use `useTransition` and keep the **previous content on screen**, slightly
  dimmed or with reduced opacity, while the next state loads. Do not swap to
  an empty state or a spinner.
- Where a skeleton genuinely is needed (true first load), it must match the
  final layout's **exact dimensions**. A skeleton that changes size when
  real data arrives causes layout shift, which reads as a glitch even when
  it is fast.
- Prefetch the adjacent states. Week/Month/Year and previous/next month are
  all predictable — fetch them before they are asked for.
- Keep the segmented control's own state **client-side and optimistic**. The
  pill moves the instant it is tapped, never after a round trip.
- Animate only `transform` and `opacity`, so it stays on the compositor.
  Nothing that triggers layout.
- Respect `prefers-reduced-motion`.

## Measure it, don't feel it

- **Zero cumulative layout shift** on every transition. Verify in devtools,
  not by eye.
- The segmented pill responds in the **same frame** as the tap.
- Throttle the CPU 4× in devtools and check it still holds. It feels fine on
  a laptop and that is not the target.
- `Boot.tsx` currently spends about two seconds on the cold open before the
  app is usable. `CLAUDE.md` says usable in about four seconds from cold.
  Measure the real number on a throttled profile and cut the cold open if it
  does not fit.

---

# Part C — the AI tab's data, and the provider

**No design skills. This is wiring.**

## It is calling the wrong provider

The tab currently errors with `ANTHROPIC_API_KEY is not set`. The decision
changed on 2026-09-22 — see `docs/BUILD-PROMPT-v3.md` step 6. Move it to
**Google Gemini's free tier**:

- SDK `@google/genai` (**not** `@google/generative-ai`). Pin `<3.0.0` unless
  on Node 22+.
- Free tier is Flash and Flash-Lite only. **Check `ai.google.dev` for the
  current model ID — do not write one from memory.**
- Key is `GEMINI_API_KEY`, server-side only, never a `NEXT_PUBLIC_` prefix.
- Google Search grounding is included free — that is where external figures
  and their citations come from.
- **Put the provider behind `lib/ai/client.ts` and let nothing else import
  the SDK.** Free tiers move constantly; switching must cost one file.
- Free tier is roughly 5–15 requests/minute. Handle a 429 with a message
  that says what happened, not a spinner that never resolves.

## What the AI must be able to see

The test question is real and already failing:

> *"I'm going on Erasmus to Montreal in January for a semester, I've no
> money right now — how much will I need and can you help me build a
> budget?"*

To answer that it needs tools over the user's own data. Build the schema and
the calculation layer from `docs/BUILD-PROMPT-v3.md` steps 2, 5, 6 and 8 if
they are not in yet — the migration, `lib/budget`, the tool surface, and the
Revolut CSV import.

Read tools: pay snapshot for a period · upcoming rostered shifts · goal with
its lines and projection · spending by category over a window · recurring
outgoings · imported transactions · profile facts · the cashflow figure that
ties rostered earnings to outgoings and the goal.

Propose-only write tools: `propose_goal_line`, `propose_outgoing`,
`propose_profile_fact`, `propose_txn_category`. They return a proposal; the
user taps to commit. Nothing writes silently.

## The rule that governs it

**The model narrates. The code calculates.**

Every euro figure it states comes back from a tool that computed it in
`lib/pay` or `lib/budget`. It must never total transactions, pro-rata a
monthly figure, or work out weeks-to-target itself.

Any figure about the outside world — rent in Montreal, a flight, an
Erasmus+ rate — needs a grounded citation stored with it and the date
checked, exactly as `docs/PAY-RULES.md` does. Unsourced means the line is a
`guess` and says so.

**Test this explicitly before calling it done:** ask it something requiring
arithmetic over real data and confirm the transcript shows a tool call, not
a confident-sounding number. That failure mode is the entire reason this
architecture exists.

## Also fix

`/auth/error` shows "Sign-in is limited to TCD accounts" as the headline
while the real reason is something else entirely — it cost hours of
debugging the wrong thing. Show the real reason first and make any hint
match the reason code it was given. Sign-in accepts **any** Google account;
remove any domain restriction or `hd` parameter.

---

# Verification, all parts

- **390×844, both worlds, every screen, before and after. Look at them.**
- **Empty and populated.** Seed with `scripts/seed-month.mjs`. A layout that
  only works full is broken, and so is one that only works empty.
- Contrast recomputed for every text token against its real surface.
- Every tappable target ≥ 44px.
- No `shadow` anywhere.
- Zero layout shift on transitions, verified in devtools.
- `npm run lint` and `npm run build` clean.
- `npm run test:rls` green — and per rule 5, watched to fail first.

# Out of scope

New dependencies beyond `@google/genai` (ask first). A component library.
Holiday tab. PAYE/USC/PRSI. Streaks. Anything not named above.
