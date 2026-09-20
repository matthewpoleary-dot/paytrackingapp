-- Proving the RLS test can actually fail.
--
-- A green suite that never attempted an unauthorised read proves nothing, and
-- a suite that has quietly stopped attempting one looks identical to a suite
-- that is passing honestly. This is how you tell them apart.
--
-- Run STEP 1 in the Supabase SQL editor, then `npm run test:rls`. Exactly two
-- tests must go red:
--
--     ✖ bob cannot read alice's rows
--     ✖ bob cannot read alice's shift by its id
--
-- All four write protections must stay green — the hole below is SELECT-only,
-- so anything else going red means something unrelated is broken.
--
-- Then run STEP 2 and re-run the suite. It must be back to 8/8.
--
-- Worth repeating after any change to a policy, and before trusting a green
-- run on a table whose policies you have just edited.


-- STEP 1 — open the hole -----------------------------------------------------

create policy "TEMP deliberate leak"
  on public.shift for select to authenticated
  using (true);


-- STEP 2 — close it. Do not leave this undone. -------------------------------

-- drop policy "TEMP deliberate leak" on public.shift;
