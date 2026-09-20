# v1 build prompt

Paste into Claude Code from the repo root.

---

Read `CLAUDE.md` and `docs/PAY-RULES.md` before anything else. They are the
brief — don't re-derive decisions they already settle, and don't expand the
v1 scope they define.

This session is scaffold, data model, and the shift-entry slice. Not the
whole app. No holiday tab.

First, do the workspace setup in `docs/SETUP.md` — the skills, Impeccable,
and the `disable-model-invocation` flags. Tell me what's installed, then
show me your plan and wait before building.

**Build order**

1. **Scaffold.** Next.js App Router + TypeScript + Tailwind + Supabase
   client. Nothing else — ask before adding any dependency.

2. **Schema, as one migration.** Highest-stakes step. Show it to me before
   you apply it.
   - `user_id` and an RLS policy on every table holding user data, live
     from this first migration. Supabase anonymous session, no auth screen.
     Do not stub a user or disable RLS "for now".
   - shift: date, planned start, planned end, actual end (nullable),
     planned break minutes, actual break minutes (nullable),
     `source` ('manual'), user_id
   - pay period: `actual_paid` nullable — nothing uses it yet, it just has
     to exist
   - settings: hourly rate, breaks_paid, pay period length
   - money as integer cents, durations as integer minutes, timestamps UTC
   - Write a test that attempts a cross-user read and asserts it fails. A
     policy I haven't watched fail isn't tested.

3. **First run.** Three questions: hourly rate, are breaks paid, how often
   are you paid.

4. **Roster entry.** A week of shifts in one sitting — "how many shifts?",
   then date and times for each, pickers prefilled from the user's usual
   shape. If breaks are unpaid, a break field with a sensible default. If
   breaks are paid, no break field at all.

5. **End-of-week confirmation.** Fill in actual finish times and actual
   breaks against shifts already logged.

6. **This period.** What the logged shifts are worth. Estimated until the
   actuals are in — and it has to *look* estimated, not be presented as
   fact.

**Rules for this session**

- Static structure only. Use Impeccable. Do not load `emil-design-eng` or
  `animate` at all this session — see rule 1. Motion comes after the static
  design settles.
- Never invent a pay rule. `docs/PAY-RULES.md` has what's verified and an
  explicit "not yet researched" list. If you need something on that list,
  stop and ask — don't fill the gap from memory.
- Before calling any screen done, screenshot it at 390×844 and actually
  look at it. The desktop view doesn't count.

Stop after step 2 and show me the migration.
