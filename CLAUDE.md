# paytrackingapp

A part-time worker's best friend. Your roster lands Sunday night; you enter
the week's shifts in one sitting; the app tells you what the week is worth
and what holiday pay you've accrued. The thing most people do in their
Notes app, except it knows Irish pay law.

Mobile-first web app. Personal project; the immediate user is me, working
shifts in a pub in Dublin.

## First run

Four questions, once: **hourly rate**, **are your breaks paid?**, **how
often are you paid?** (weekly / fortnightly / monthly — weekly is the common
case but it is asked, not assumed), and **do you get paid more on Sundays?**

The second is not a detail. Irish law gives no right to paid breaks — they
aren't working time — so it is purely a matter of contract and cannot be
inferred. See `docs/PAY-RULES.md`.

If breaks are paid, the app never asks about breaks again. Don't collect
data you'll never use.

The fourth needs care in the asking. Many hospitality contracts bake Sunday
into the base rate, so plenty of people genuinely don't know. **"Not sure"
must be a real answer, stored as null, and it is not the same as "no."**
That distinction is the only thing that lets the app later say *you work
Sundays and no premium appears anywhere — s.14 may entitle you to one.*
Collapse null into zero and that flag can never fire.

Four questions pushes on the four-second bar, so every one of them carries a
one-tap default and the whole thing is skippable.

## Core flow

One weekly ritual, not a daily nag. Same sitting, both halves:

1. Confirm last week's actual finish times (`5-c` becomes `5-1:20`).
2. Enter next week's roster — "how many shifts?" → date + times for each.

Entry has to survive real roster shorthand: `mon 5-c`, `sat 6-c`,
`sun 3-9`. Where breaks are unpaid, a break goes in with each shift, with a
sensible default rather than a fresh prompt every time.

## The principle: record reality where payroll assumes a default

Three places a part-timer's pay quietly leaks, all the same shape —
payroll assumes something, reality differed, nobody wrote it down:

| Payroll assumes | Reality |
|---|---|
| The shift ended at close | It ended 20 minutes later, every week |
| A 30-min unpaid break was taken | On a busy night it wasn't |
| No break was owed | 6+ hours worked means 30 minutes was owed |

So a shift stores **planned** and **actual** for both its end time and its
break. Until the actuals are in, the week's value is an estimate and must
look like one — never presented as fact.

This is also what makes the app evidence. A contemporaneous log of when you
actually finished and whether you actually got your break is a record your
employer doesn't have. That restores the mispayment case entirely without
ever parsing a payslip.

## Tabs

*(Superseded 2026-09-21 — see v3 scope. Three tabs now: Shifts, Budget,
Ask.)*

- **This period** — shifts logged, what it's worth. *v1.*
- **Holiday** — accrued annual leave and what it's worth. *Not v1* — see
  below.

## v1 scope

Decided 2026-09-20. Build exactly this; resist adding to it.

**In:**

- First-run setup: rate, breaks paid?, pay period length, Sunday premium.
- Roster entry — a week of shifts in one sitting.
- End-of-week confirmation of actual finish times and breaks taken.
- What this period is worth.

**Out of v1, but the schema must not preclude it:**

- **Holiday tab.** Shift logging comes first — holiday figures are only as
  good as the shift history behind them, and on day one there isn't any.
  `docs/PAY-RULES.md` has the accrual rules ready for when it lands.
- **Login.** *(Overturned 2026-09-21 — see v3 scope. Google sign-in ships;
  the anonymous session is gone. The RLS instruction below still stands
  absolutely.)* No auth screen in v1. Use a Supabase anonymous session so
  there is still a real `user_id` — every table carries it and every RLS
  policy is live and tested from the first migration. An anonymous session
  upgrades to a real account later without migrating any data. Do **not**
  hardcode a user id or disable RLS "for now"; that is the version that
  never gets fixed.
- `actual_paid` on the pay period (see Scope).
- Shift `source` beyond `manual`.

**Entry style:** pickers with smart defaults, not shorthand parsing. Tap a
day, tap start, tap end, prefilled with the user's usual shape so a typical
shift is confirm-and-move-on. Shorthand parsing (`mon 5-c`) is a later
optimisation if entry still feels slow — not a v1 problem.

**Rate:** one rate per user for now, stored so that a per-shift override
can be added later without a migration.

**Pay rises, decided 2026-09-20.** Every shift stores the rate it was
worked at, copied from settings when it is logged. `settings.hourly_rate_cents`
is "my rate now" and is *only* the default for new shifts — never the
source of truth for what a logged shift was worth. Changing it is the
pay-rise flow and must leave the existing log untouched. If the settings
rate were authoritative, a rise would silently re-price every shift already
recorded and last month would quietly become worth more than it was — which
would destroy the app as evidence. The same column doubles as the per-shift
override.

## v3 scope

Decided 2026-09-21 and 2026-09-22. **Where this section contradicts anything
above it, this section wins.** Nothing below it — the bar, the rules, the
money conventions, the working agreement — is affected.

Tally stops being a pay calculator and becomes a savings hub for one
part-time worker saving for Erasmus. Everything serves one sentence the app
must always be able to say: *€4,200 by August. You're at €1,150. At the rate
you're setting aside you land in October — six weeks late. Six extra Sundays
closes it.*

**Three tabs: Shifts, Budget, Ask.** This supersedes the Tabs section above.
The Holiday tab is still not built.

**Rules this overturns.** Each is marked at its source above.

1. **Google sign-in replaces the anonymous session.** Anonymous was
   device-bound, and the app now holds a year of pay and savings history plus
   bank transactions. Losing that to a cleared cache is not acceptable. The
   RLS half of that original rule is untouched and still absolute.
2. **CSV import of the user's own statements is in.** Revolut's export
   format, hardcoded. Still no OCR, no PDF parsing, no open banking, no
   aggregator — the objection was never to reading a statement, it was to
   building an import pipeline. One parser for one bank is not a pipeline.
3. **The design direction is being replaced.** Forest green, bone and brass
   are retired, and `tighsauna.com` is no longer the reference. See the
   Design direction section, which is being rewritten by the work in
   `docs/OVERHAUL-PROMPT.md`. What survives: flat, no shadows, large text
   light and tight, tracking as a function of size, money never
   accent-coloured, one accent carrying exactly one meaning.

**Decisions that are settled and are not to be relitigated:**

- **The AI proposes; the user confirms.** Every write it makes is a card the
  user taps. Nothing writes silently.
- **The model narrates, the code calculates.** Every euro figure the AI
  states comes back from a tool that computed it in `lib/pay` or
  `lib/budget`. It never totals a list itself. Rule 4 exists because Claude
  asserted a pay figure from memory once already in this project; an AI
  inventing a budget number is the same bug wearing a different hat.
- **Memory is the schema, not the transcript.** Durable facts — destination,
  departure month, rent, the buffer not to dip below — live in rows the rest
  of the app can compute with. A transcript nobody can query is not memory.
- **Provider: Google Gemini's free tier**, decided 2026-09-22 on cost, behind
  `lib/ai/client.ts` so nothing else imports the SDK. Free tiers move
  constantly; switching must cost one file. The free tier is acceptable for
  bank data only because EEA users get the paid data terms — verify that
  before importing a real statement.
- **The savings goal is a cost breakdown, not a number.** Lines, each with an
  amount and a confidence: `quoted`, `researched`, `guess`. The target is the
  sum, and it improves as real figures arrive.
- **No streaks.** Rejected 2026-09-21: the weekly ritual is the cadence, and
  a daily counter on a data-entry chore rewards fabricated entries, which
  would destroy the log's value as evidence.

**Still out:** holiday tab, OCR, open banking, PAYE/USC/PRSI, a component
library, identity linking for when the TCD account is disabled (noted, not
built).

## The bar

**The competitor is the Notes app.** If logging a shift is slower than
typing "fri 6-close" into Notes, this loses. That constraint outranks
almost everything else:

- No login wall before the first number appears.
- No onboarding flow, no employer setup wizard.
- Usable in about four seconds from cold.
- Most shifts repeat — learn the usual shape and offer it for confirmation
  rather than asking for it again.

## Scope

Single account in practice, **multi-user schema from day one**. Every table
that holds user data carries a `user_id` and an RLS policy, even while
there's exactly one user. Do not "simplify" this away — the point is that
sharing it later isn't a rewrite.

**No payslip parsing.** *(Partly overturned 2026-09-21 — see v3 scope.
Revolut CSV import is in. Payslip parsing and OCR are still out.)* The app
computes what you're owed; the user
compares that to what actually landed. There is no payslip import, no OCR,
no bank integration.

But: pay periods carry a nullable `actual_paid`. One optional field the
user can fill or ignore. Empty, the app is a calculator; filled, it becomes
a watchdog that can show a discrepancy history. It cannot be backfilled
later, so it exists from the first migration even though nothing in the UI
may use it yet.

## Stack

Next.js (App Router, TypeScript) · Supabase (Postgres, auth, RLS) ·
Tailwind · Vercel. Sentry once there are real users. No Stripe — this is
not a paid product.

## Design direction

*(Being replaced, 2026-09-22 — see v3 scope. The palette and the
`tighsauna.com` reference are retired; `docs/OVERHAUL-PROMPT.md` carries the
new direction. The two rules below the palette — flat with no shadows, and
large text set light and tight — survive unchanged and are why this section
is not simply deleted.)*

Structure from Apple Health: a recessed page field, raised grouped cards,
generous whitespace, data-dense but calm.

**Surface and type from `tighsauna.com`** (chosen 2026-09-20). Deep forest
green `#0B3028` and warm bone `#F3F1E6` as two complete worlds — light is
the bone world, dark is the forest world — with brass `#CBB47C` as the only
accent, carrying exactly one meaning: *not settled yet*.

Two rules that came from studying it, and that matter more than the palette:

- **Flat. No shadows anywhere.** Separation comes from the surface step and
  from space. Shadows are what make a layout read as a dashboard.
- **Large text is set light and tight, never bold.** Its h1 is 150px at
  weight 450 with -0.073em tracking and leading below 1. Tracking is a
  function of size, from about -0.055em at display to ~0 at caption — one
  letter-spacing value would be wrong at both ends.

Money is never accent-coloured. It is already the highest-contrast thing on
the screen and needs no help.

Real motion, but only once the static design has settled — see rule 1.

## Non-negotiable rules

1. **Never load `impeccable` and `emil-design-eng` on the same turn.** They
   disagree on type and spacing. Impeccable for structure and audit; Emil's
   skills for motion, and only once the static design is settled.
   Enforced with `disable-model-invocation: true` on `impeccable`,
   `emil-design-eng` and `animate` — see `docs/SETUP.md`. Don't remove those
   flags; call the skills explicitly instead.

2. **390px is the primary target.** Desktop is secondary. Screenshot at
   390×844 before calling any UI done. Nothing ships that was only ever
   looked at on a laptop.

3. **Load the `dataviz` skill before writing any chart code.** Before the
   first line — not after a draft exists.

4. **Never invent a pay rate or a pay rule.** Claude has already got this
   wrong once in this project by asserting a Sunday multiplier from memory.
   Ireland-specific: Sunday premium, public holidays, unpaid breaks. Source
   every figure from Revenue (revenue.ie), the WRC
   (workplacerelations.ie) or the statute book, cite it, and date it.

   **There is no statutory Sunday multiplier in Ireland.** Section 14 of
   the Organisation of Working Time Act 1997 entitles an employee required
   to work Sunday to compensation — a reasonable allowance, a reasonable
   increase in rate, reasonable paid time off, or a combination — *unless*
   Sunday working was already taken into account when the rate was set.
   So the app cannot compute a Sunday premium from law. It applies the
   premium the user's own contract gives them, and may flag that an
   entitlement could exist where no premium appears anywhere. Public
   holiday entitlement is separate and not yet researched — do not assume
   it works the same way.
   Rates change by tax year — a figure in the codebase without a tax year
   attached is a bug. Rules live in `docs/PAY-RULES.md` (not yet written);
   code reads them from one place, never hardcoded at the call site.

   **Gross only.** PAYE/USC/PRSI are cumulative, depend on the user's tax
   credits and cut-off point, and are almost never where a shortfall comes
   from. Out of scope until there's a reason.

5. **RLS is not optional.** Every row is someone's personal pay data. No
   table ships without row-level security, and policies get *tested* —
   write a failing cross-user read before you trust a policy. A green test
   suite that never attempted an unauthorised read proves nothing.

## Money

Store money as integer cents, never floats. Hours as integer minutes.
Rounding rules are a domain decision, not an implementation detail — when
one comes up, ask rather than picking one.

**Rounding, decided 2026-09-20.** Round to the cent **per shift**, half up.
The period total is the **sum of the rounded shifts**, never an independent
calculation. Both figures are shown — Monday is worth €x, the week is worth
€y — and a screen whose rows don't add up to its total destroys the app's
credibility as evidence. Sum-of-shifts is what guarantees they reconcile.

All timestamps stored UTC. Display in `Europe/Dublin`. Shifts crossing
midnight and the DST boundaries (late March, late October) are real cases
here, not edge cases — a night shift on the October change is 9 hours paid,
not 8.

## Working agreement

- Ask before adding a dependency.
- Migrations are checked in and forward-only.
- Secrets in `.env.local`, never committed. `.env.example` stays current.
- Shifts are stored individually, never as a period total — a total can't
  be decomposed later, and any premium rate the user's contract gives them
  needs to know which hours fell on which day. Period figures are derived.
  (Open: Matthew may prefer a running period total instead.)
- Every shift carries a `source` (`manual` for now). Calendar or rota
  import, if it ever happens, is another value here and nothing else in the
  app should care.
