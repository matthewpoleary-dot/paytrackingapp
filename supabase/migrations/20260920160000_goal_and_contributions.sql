-- paytrackingapp — savings goal and contributions
--
-- Same conventions as the initial migration: money in integer cents, dates as
-- Dublin calendar days, user_id and forced RLS on every table.
--
-- Forward-only. Do not edit once applied.

-- ---------------------------------------------------------------------------
-- Where a contribution came from.
--
-- 'manual' is the only value now. A bank connection would add a value here
-- and nothing else in the app would change — which is the point. The columns
-- that make that an import adapter rather than a rewrite are external_id and
-- the unique index over (user_id, source, external_id): an importer can
-- re-run over the same statement without duplicating rows, which is the
-- thing that actually bites when you bolt one on later.
-- ---------------------------------------------------------------------------

create type public.contribution_source as enum ('manual');


-- ---------------------------------------------------------------------------
-- goal
--
-- What the user is saving towards. target_date is nullable on purpose: "I want
-- 3,000" is a complete goal, and the app's job is then to tell you WHEN you
-- would get there. Forcing a date would make the projection circular.
-- ---------------------------------------------------------------------------

create table public.goal (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,

  name          text not null default 'Savings goal'
                  check (char_length(name) between 1 and 80),
  target_cents  integer not null check (target_cents > 0),
  target_date   date,

  -- Set when the user closes a goal out, so the history survives rather than
  -- being deleted. Nothing in v2's UI writes it yet.
  archived_at   timestamptz,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- One live goal at a time. Archived ones do not count, so a user can have a
-- history without ever having two active targets to reconcile.
create unique index goal_one_active_per_user
  on public.goal (user_id)
  where archived_at is null;

create trigger goal_set_updated_at
  before update on public.goal
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- contribution
--
-- What the user actually set aside — NOT what they earned. Earnings are
-- already derivable from the shift log; this table exists because the gap
-- between earning and keeping is the whole point of a savings goal.
-- ---------------------------------------------------------------------------

create table public.contribution (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,

  -- Nullable: a contribution recorded before any goal existed is still a real
  -- contribution, and deleting a goal must not delete the money.
  goal_id        uuid references public.goal (id) on delete set null,

  -- Signed. A withdrawal is a negative contribution rather than a second
  -- table — the running total is then a plain sum, and no screen has to
  -- remember to subtract one thing from another.
  amount_cents   integer not null check (amount_cents <> 0),

  -- Dublin calendar day, like shift.work_date.
  contributed_on date not null,

  note           text check (note is null or char_length(note) <= 200),

  source         public.contribution_source not null default 'manual',

  -- The importer's idempotency key. Null for anything hand-entered.
  external_id    text check (external_id is null or char_length(external_id) <= 200),

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index contribution_user_date_idx
  on public.contribution (user_id, contributed_on desc);

-- Re-importing the same transaction must not double-count it.
create unique index contribution_external_once
  on public.contribution (user_id, source, external_id)
  where external_id is not null;

create trigger contribution_set_updated_at
  before update on public.contribution
  for each row execute function public.set_updated_at();


-- ---------------------------------------------------------------------------
-- Row-level security
--
-- Same shape as the initial migration: enabled AND forced, all four verbs,
-- auth.uid() in a subselect so the planner evaluates it once per statement.
-- ---------------------------------------------------------------------------

alter table public.goal         enable row level security;
alter table public.goal         force  row level security;
alter table public.contribution enable row level security;
alter table public.contribution force  row level security;

create policy "goal: owner can read"
  on public.goal for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "goal: owner can insert"
  on public.goal for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "goal: owner can update"
  on public.goal for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "goal: owner can delete"
  on public.goal for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "contribution: owner can read"
  on public.contribution for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "contribution: owner can insert"
  on public.contribution for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "contribution: owner can update"
  on public.contribution for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "contribution: owner can delete"
  on public.contribution for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.goal, public.contribution from anon;
