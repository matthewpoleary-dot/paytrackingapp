# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One part-time hospitality worker — currently a pub in Dublin — who is paid
hourly and whose roster arrives at the end of the week for the week ahead.
Student-aged, on a phone, entering a week of shifts in one sitting rather
than logging a shift a day.

Single account in practice. The schema is multi-user from the first
migration (`user_id` plus a tested RLS policy on every table holding user
data) so that sharing later is not a rewrite, but no sharing feature is
built or planned.

## Product Purpose

Tell a part-time worker what their week is worth, and whether they are going
to reach whatever they are saving for.

Two halves of one weekly ritual: confirm what was actually worked last week,
then enter next week's roster. From that the app derives what the period is
worth, and what that means for a savings target the user sets themselves.

Success is that entering a week beats typing it into the Notes app, and that
the resulting log is good enough to argue with.

## Positioning

**It records reality where payroll assumes a default.** Three places a
part-timer's pay quietly leaks share one shape — payroll assumes something,
reality differed, nobody wrote it down:

| Payroll assumes | Reality |
|---|---|
| The shift ended at close | It ended 20 minutes later, every week |
| A 30-minute unpaid break was taken | On a busy night it wasn't |
| No break was owed | 6+ hours worked means 30 minutes was owed |

So a shift stores **planned** and **actual** for both its end time and its
break. A contemporaneous log of when you actually finished and whether you
actually got your break is a record the employer does not have, which is
what makes the app evidence rather than a calculator — and it gets there
without ever parsing a payslip.

The second, harder-to-copy half: the app knows the user's roster, rate,
spending and goal at once. That is the only reason its AI tab can beat
opening claude.ai and typing the same question.

## Operating Context

- **The ritual is weekly, not daily.** The roster lands Sunday night and the
  week goes in in one sitting. Deliberately not a daily nag; a daily counter
  on a data-entry chore would reward fabricated entries and destroy the
  log's value as evidence.
- **Phone, 390×844 primary.** Desktop is secondary. Often one-handed,
  often in a hurry, sometimes at the end of a shift.
- **Four seconds from cold** is the standing bar. The competitor is the
  Notes app: if logging a shift is slower than typing `fri 6-close`, the app
  loses.
- **Ireland.** Times display in `Europe/Dublin`; shifts crossing midnight
  and both DST boundaries are ordinary cases, not edge cases.

## Capabilities and Constraints

**Built:** first-run setup (rate, breaks paid, pay-period length, Sunday
premium); roster entry for a week at a time; end-of-week confirmation of
actual finishes and breaks; what a week / month / year is worth; a savings
goal with a projection; a budget tab; an AI tab.

**Money and time.** Money is integer cents, durations integer minutes,
timestamps UTC. Rounding is to the cent **per shift**, half up, and a period
total is the **sum of the rounded shifts** — never an independent
calculation, so the rows on a screen always add up to its total.

**Rates are historical.** Every shift stores the rate it was worked at.
Settings hold "my rate now", which is only the default for new shifts.
Changing it must leave the existing log untouched, or a pay rise would
silently re-price last month and destroy the app as evidence.

**Estimated is not confirmed.** Until actuals are in, a figure is an
estimate and must never be presented as fact.

**Irish pay law is sourced, never remembered.** Rules live in
`docs/PAY-RULES.md` with a citation and a date; code reads them from one
place. There is no statutory Sunday multiplier in Ireland — s.14 of the
Organisation of Working Time Act 1997 entitles a Sunday worker to
compensation *unless* Sunday was already built into the rate, so the app
applies the user's own contract and may only *flag* that an entitlement
could exist. Public holiday entitlement is separate and **not yet
researched**.

**Gross only.** PAYE/USC/PRSI are out of scope.

**Sign-in is Google, open to any Google account** (confirmed 2026-09-22,
replacing an earlier TCD-only restriction). There is a sign-in wall; the
four-second bar governs everything behind it.

**The AI narrates, the code calculates.** Every euro figure the model states
comes back from a tool that computed it in `lib/pay` or `lib/budget`. It
never totals transactions or works out weeks-to-target itself. Any figure
about the outside world needs a stored citation with the date checked, or
the line is labelled a guess. Every write it makes is a card the user taps;
it never writes silently.

**The savings goal is whatever the user is saving for** (confirmed
2026-09-22). Erasmus, a trip, rent — the destination, amount and deadline
are user-entered. Bologna and Montreal appear in the repo only as example
questions. Nothing may hardcode a city, a currency other than euro, or a
date.

**Out of scope, durably:** payslip parsing, OCR, PDFs, open banking and
aggregators. Revolut CSV import of the user's own statement is the single
exception, hardcoded to that one format. Also out: a holiday tab (the
accrual rules are researched and waiting, but shift history has to exist
first), streaks, and multi-user sharing beyond the RLS already in place.

**Undecided:** whether a running period total should replace per-shift
storage (noted as an open preference, not a plan). Identity linking for the
graduation cliff is noted as a follow-up, not built.

## Brand Commitments

- **Name:** Tally. Wordmark and mark exist in `app/_components/Wordmark.tsx`.
- **Money is never accent-coloured.** It is already the highest-contrast
  thing on screen and needs no help.
- **One accent, carrying exactly one meaning: "not settled yet."**
- **Flat.** No shadows. Separation comes from the surface step and from
  space.
- **Large text is set light and tight, never bold.** Tracking is a function
  of size.
- The deep-forest-green palette is being **retired** (2026-09-22). Its
  replacement is an open decision and is explicitly not to be invented
  without the user.

## Evidence on Hand

- `CLAUDE.md` — the standing brief, including scope decisions with dates and
  three rules marked as overturned.
- `docs/PAY-RULES.md` — verified Irish pay rules with citations, plus an
  explicit "not yet researched" list that must not be filled from memory.
- `scripts/contrast.mjs` — measures every text token against the real
  composited surface; exits non-zero on failure.
- `scripts/shoot-v3.mjs`, `scripts/seed-month.mjs` — 390×844 capture of
  empty and populated states in both schemes.
- `tests/rls.test.mjs` — 30 passing tests that attempt cross-user reads and
  assert they fail.
- `docs/design/*.png` — screenshots of the pre-restructure build, now
  historical.

**No real user data exists beyond Matthew's own.** There are no customers,
no testimonials, no benchmarks and no pricing — the app is not a paid
product and has no other users. None may be invented.

## Product Principles

1. **The competitor is the Notes app.** Speed of entry outranks almost
   everything else.
2. **Record reality where payroll assumes a default.** Planned and actual,
   both stored, or the app is just arithmetic.
3. **Never present an estimate as a fact**, and never invent a pay rule or a
   figure — source it, cite it, date it.
4. **The log must stay trustworthy over time.** Nothing may retroactively
   change what an already-recorded week was worth.
5. **Don't collect data you will never use.** Four setup questions, each
   with a one-tap default, all skippable.

## Accessibility & Inclusion

- **WCAG 2.1 AA on text: 4.5:1 small, 3:1 large**, measured against the real
  composited surface rather than eyeballed, in **both** light and dark
  worlds. A direction that fails is rejected.
- **Every tappable target ≥ 44px.**
- Estimated-versus-confirmed is carried by four redundant signals (a leading
  `~`, lighter weight, a dashed underline, and the word plus an aria-label)
  so it survives greyscale, colour blindness, a screenshot and a screen
  reader.
- `prefers-reduced-motion` and `prefers-contrast: more` are both honoured.
