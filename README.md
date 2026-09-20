# paytrackingapp

Log shifts, calculate what you're owed, reconcile against the payslip you
actually received. Catches mispayments.

Irish pay rules — Sunday premium, public holidays, unpaid breaks,
PAYE/USC/PRSI. Mobile-first, 390px primary.

## Status

Scaffold, initial schema and first-run setup are in and live at
https://paytrackingapp.vercel.app. The migration is applied and
`tests/rls.test.mjs` passes 8/8 against the real database.

Next: roster entry, end-of-week confirmation, what the period is worth.

## Running the RLS test

```bash
npm run test:rls
```

Needs `.env.local` (`npx vercel env pull .env.local`), the migration applied,
and anonymous sign-ins enabled in Supabase.

**A green run on its own proves nothing.** Before trusting it — and after any
policy change — follow `supabase/verify-rls-test.sql` to open a deliberate
hole, watch exactly two tests go red, then close it.

## Layout

| Path | What |
|---|---|
| `CLAUDE.md` | Project rules. Read first. |
| `docs/SETUP.md` | One-time workspace setup — skills, Impeccable, Playwright. |
| `docs/PAY-RULES.md` | Sourced Irish pay rules. |
| `supabase/migrations/` | Forward-only. Never edit an applied migration. |
| `tests/rls.test.mjs` | Cross-user isolation. Must be watched to fail. |
| `supabase/verify-rls-test.sql` | How to watch it fail. |
| `scripts/shot.mjs` | 390x844 screenshot harness. |

## Stack

Next.js (App Router, TypeScript) · Supabase · Tailwind · Vercel
