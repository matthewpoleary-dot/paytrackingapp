# Tally (paytrackingapp)

A shift, pay and savings tracker for part-time workers in Ireland. Enter the week's roster once, and the app tells you what the week is worth, so you can check it against what actually lands in your account.

I built it for myself: I work shifts in a Dublin pub and was keeping the numbers in my Notes app.

**Live:** https://paytrackingapp.vercel.app (sign-in is restricted to Trinity College accounts, so it is not open for public sign-up)

## What it does

- **Shifts:** log a week of shifts in one sitting with smart defaults, then confirm the actual finish time and break taken at the end of the week. Each shift stores planned and actual values, so the log becomes a record of what really happened.
- **Pay:** calculates what a period is worth from the shifts, using the rate each shift was worked at, so a pay rise never re-prices old shifts.
- **Budget:** imports a Revolut CSV statement and breaks spending down.
- **Goal:** set a savings target as a cost breakdown (each line marked quoted, researched or guess) and see whether you land it by your deadline.
- **AI tab:** a chat assistant that can look at your roster, rate, goal and spending through tools. Every proposed change is a card you confirm, and it never writes silently.

## Design decisions

- **The model narrates, the code calculates.** Every euro figure the AI states comes from a tool that computed it in `lib/pay` or `lib/budget`. Figures about the outside world need a sourced citation.
- **No invented pay rules.** There is no statutory Sunday premium in Ireland (Organisation of Working Time Act 1997, s.14), so the app applies the premium from the user's own contract rather than guessing one. Sourced rules live in `docs/PAY-RULES.md`.
- **Money is integer cents, time is integer minutes.** Rounding is per shift, half up, and the period total is the sum of the rounded shifts, so the rows on screen always add up to the total.
- **Row-level security on every table.** Each row carries a `user_id`, and the policies are tested with cross-user reads (`npm run test:rls`).
- **Only computed aggregates go to the model.** No transaction description or merchant name is ever sent.

## Stack

Next.js (App Router), React 19, TypeScript, Tailwind CSS, Supabase (Postgres, auth, RLS), Google Gemini via `@google/genai`, Vercel.

## Running it locally

```bash
npm install
npm run dev
```

Create `.env.local` from `.env.example`:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your Supabase project |
| `GEMINI_API_KEY` | Server-side key for the AI tab |
| `GEMINI_MODEL` | Optional model override |

Apply the SQL in `supabase/migrations/` to your own Supabase project, and enable a sign-in provider (the Google setup is described in `docs/SETUP.md`).

## Tests

```bash
npm test
```

Runs the domain, budget, CSV import, AI and RLS suites. The RLS suite needs a configured Supabase project.

## Project layout

| Path | What |
|---|---|
| `app/` | Pages: setup, roster, confirm, period, budget, goal, AI |
| `lib/pay/` | Pay calculation, periods, projections, money helpers |
| `lib/budget/` | Budget maths and Revolut CSV import |
| `lib/ai/` | Gemini client and the tools it can call |
| `supabase/migrations/` | Forward-only schema migrations |
| `docs/` | Pay rules and setup notes |
