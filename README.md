# paytrackingapp

Log shifts, calculate what you're owed, reconcile against the payslip you
actually received. Catches mispayments.

Irish pay rules — Sunday premium, public holidays, unpaid breaks,
PAYE/USC/PRSI. Mobile-first, 390px primary.

## Status

Scaffold and initial schema in. Migration written but **not yet
applied** — no Supabase connection on this machine, so the cross-user RLS
test in `tests/rls.test.mjs` has not been run. See below.

## Running the RLS test

```bash
cp .env.example .env.local   # fill in from Supabase -> Project Settings -> API Keys
npm run test:rls
```

Needs the migration applied and anonymous sign-ins enabled in Supabase
(Authentication -> Sign In / Providers -> Anonymous).

## Layout

| Path | What |
|---|---|
| `CLAUDE.md` | Project rules. Read first. |
| `docs/SETUP.md` | One-time workspace setup — skills, Impeccable, Playwright. |
| `docs/PAY-RULES.md` | Sourced Irish pay rules. |
| `supabase/migrations/` | Forward-only. Never edit an applied migration. |
| `tests/rls.test.mjs` | Cross-user isolation. Must be watched to fail. |

## Stack

Next.js (App Router, TypeScript) · Supabase · Tailwind · Vercel
