// Cross-user isolation test.
//
// The point of this file is the *negative* assertions. A green suite that
// never attempted an unauthorised read proves nothing, so every block here
// first proves the row exists and is visible to its owner, and only then
// proves the other user cannot reach it. Without the positive half, "zero
// rows" could just mean the insert silently failed.
//
// Run:  npm run test:rls
// Needs: .env.local, the migration applied, and anonymous sign-ins enabled
//        in Supabase (Authentication -> Sign In / Providers -> Anonymous).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Missing Supabase env. Run with: node --env-file=.env.local --test tests/rls.test.mjs',
  );
}

/** A fresh anonymous session with its own storage, so the two do not share a token. */
async function anonUser(label) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInAnonymously();
  assert.equal(error, null, `${label}: anonymous sign-in failed: ${error?.message}`);
  assert.ok(data.user?.id, `${label}: no user id returned`);
  return { client, id: data.user.id, label };
}

const iso = (d) => new Date(d).toISOString();

test('RLS: one user cannot reach another user\'s data', async (t) => {
  const alice = await anonUser('alice');
  const bob = await anonUser('bob');

  assert.notEqual(alice.id, bob.id, 'the two sessions must be different users');

  // --- Alice creates a full set of rows -----------------------------------

  const { error: settingsErr } = await alice.client.from('settings').insert({
    user_id: alice.id,
    hourly_rate_cents: 1385,
    breaks_paid: false,
    pay_period_length: 'weekly',
    period_anchor_date: '2026-09-21',
    sunday_premium_kind: null, // "not sure" — distinct from 'none'
  });
  assert.equal(settingsErr, null, `alice could not write her own settings: ${settingsErr?.message}`);

  const { data: period, error: periodErr } = await alice.client
    .from('pay_period')
    .insert({ user_id: alice.id, starts_on: '2026-09-21', ends_on: '2026-09-27' })
    .select()
    .single();
  assert.equal(periodErr, null, `alice could not write her own pay period: ${periodErr?.message}`);

  const { data: shift, error: shiftErr } = await alice.client
    .from('shift')
    .insert({
      user_id: alice.id,
      work_date: '2026-09-26',
      planned_start_at: iso('2026-09-26T17:00:00Z'),
      planned_end_at: iso('2026-09-27T00:00:00Z'),
      planned_break_minutes: 30,
      hourly_rate_cents: 1385,
    })
    .select()
    .single();
  assert.equal(shiftErr, null, `alice could not write her own shift: ${shiftErr?.message}`);

  // --- The positive half: the rows really are there ------------------------

  await t.test('alice can read her own rows', async () => {
    for (const table of ['settings', 'pay_period', 'shift']) {
      const { data, error } = await alice.client.from(table).select('id');
      assert.equal(error, null, `alice got an error reading ${table}: ${error?.message}`);
      assert.ok(
        data.length > 0,
        `alice sees no rows in ${table} — the negative assertions below would be vacuous`,
      );
    }
  });

  // --- The negative half ---------------------------------------------------

  await t.test('bob cannot read alice\'s rows', async () => {
    for (const table of ['settings', 'pay_period', 'shift']) {
      const { data, error } = await bob.client.from(table).select('*');
      assert.equal(error, null, `unexpected error reading ${table}: ${error?.message}`);
      assert.deepEqual(data, [], `LEAK: bob can see ${data?.length} row(s) in ${table}`);
    }
  });

  await t.test('bob cannot read alice\'s shift by its id', async () => {
    const { data, error } = await bob.client.from('shift').select('*').eq('id', shift.id);
    assert.equal(error, null);
    assert.deepEqual(data, [], 'LEAK: bob fetched alice\'s shift by primary key');
  });

  await t.test('bob cannot insert a row owned by alice', async () => {
    const { error } = await bob.client.from('shift').insert({
      user_id: alice.id,
      work_date: '2026-09-27',
      planned_start_at: iso('2026-09-27T17:00:00Z'),
      planned_end_at: iso('2026-09-27T23:00:00Z'),
      planned_break_minutes: 30,
      hourly_rate_cents: 1385,
    });
    assert.ok(error, 'LEAK: bob wrote a row under alice\'s user_id');
    assert.match(error.message, /row-level security/i);
  });

  await t.test('bob cannot update alice\'s shift', async () => {
    const { data, error } = await bob.client
      .from('shift')
      .update({ actual_end_at: iso('2026-09-27T02:00:00Z') })
      .eq('id', shift.id)
      .select();
    assert.equal(error, null);
    assert.deepEqual(data, [], 'LEAK: bob updated alice\'s shift');

    // And prove it from alice's side rather than trusting the empty response.
    const { data: after } = await alice.client
      .from('shift')
      .select('actual_end_at')
      .eq('id', shift.id)
      .single();
    assert.equal(after.actual_end_at, null, 'LEAK: alice\'s shift was modified by bob');
  });

  await t.test('bob cannot delete alice\'s rows', async () => {
    const { data, error } = await bob.client
      .from('pay_period')
      .delete()
      .eq('id', period.id)
      .select();
    assert.equal(error, null);
    assert.deepEqual(data, [], 'LEAK: bob deleted alice\'s pay period');

    const { data: after } = await alice.client
      .from('pay_period')
      .select('id')
      .eq('id', period.id);
    assert.equal(after.length, 1, 'LEAK: alice\'s pay period is gone');
  });

  await t.test('bob cannot reassign his own row to alice', async () => {
    const { error: mineErr } = await bob.client.from('settings').insert({
      user_id: bob.id,
      hourly_rate_cents: 1400,
      breaks_paid: true,
      pay_period_length: 'weekly',
      period_anchor_date: '2026-09-21',
    });
    assert.equal(mineErr, null, `bob could not write his own settings: ${mineErr?.message}`);

    const { data, error } = await bob.client
      .from('settings')
      .update({ user_id: alice.id })
      .eq('user_id', bob.id)
      .select();
    assert.ok(
      error || data.length === 0,
      'LEAK: bob handed his settings row to alice, bypassing the WITH CHECK clause',
    );
  });
});

test('RLS: one user cannot reach another user\'s goal or contributions', async (t) => {
  const alice = await anonUser('alice');
  const bob = await anonUser('bob');
  assert.notEqual(alice.id, bob.id, 'the two sessions must be different users');

  // --- Alice sets a goal and puts money against it ------------------------

  const { data: goal, error: goalErr } = await alice.client
    .from('goal')
    .insert({ user_id: alice.id, name: 'Deposit', target_cents: 300000 })
    .select()
    .single();
  assert.equal(goalErr, null, `alice could not write her own goal: ${goalErr?.message}`);

  const { data: contribution, error: contribErr } = await alice.client
    .from('contribution')
    .insert({
      user_id: alice.id,
      goal_id: goal.id,
      amount_cents: 15000,
      contributed_on: '2026-09-19',
      note: 'first week',
    })
    .select()
    .single();
  assert.equal(contribErr, null, `alice could not write her own contribution: ${contribErr?.message}`);

  // --- Positive half: the rows exist and their owner can see them ---------

  await t.test('alice can read her own goal and contributions', async () => {
    for (const table of ['goal', 'contribution']) {
      const { data, error } = await alice.client.from(table).select('id');
      assert.equal(error, null, `alice got an error reading ${table}: ${error?.message}`);
      assert.ok(
        data.length > 0,
        `alice sees no rows in ${table} — the negative assertions below would be vacuous`,
      );
    }
  });

  // --- Negative half -------------------------------------------------------

  await t.test('bob cannot read alice\'s goal or contributions', async () => {
    for (const table of ['goal', 'contribution']) {
      const { data, error } = await bob.client.from(table).select('*');
      assert.equal(error, null, `unexpected error reading ${table}: ${error?.message}`);
      assert.deepEqual(data, [], `LEAK: bob can see ${data?.length} row(s) in ${table}`);
    }
  });

  await t.test('bob cannot read alice\'s contribution by its id', async () => {
    const { data, error } = await bob.client
      .from('contribution')
      .select('*')
      .eq('id', contribution.id);
    assert.equal(error, null);
    assert.deepEqual(data, [], 'LEAK: bob fetched alice\'s contribution by primary key');
  });

  await t.test('bob cannot attach a contribution to alice\'s goal', async () => {
    const { error } = await bob.client.from('contribution').insert({
      user_id: alice.id,
      goal_id: goal.id,
      amount_cents: 5000,
      contributed_on: '2026-09-20',
    });
    assert.ok(error, 'LEAK: bob wrote a contribution under alice\'s user_id');
    assert.match(error.message, /row-level security/i);
  });

  await t.test('bob cannot move alice\'s target', async () => {
    const { data, error } = await bob.client
      .from('goal')
      .update({ target_cents: 1 })
      .eq('id', goal.id)
      .select();
    assert.equal(error, null);
    assert.deepEqual(data, [], 'LEAK: bob updated alice\'s goal');

    const { data: after } = await alice.client
      .from('goal')
      .select('target_cents')
      .eq('id', goal.id)
      .single();
    assert.equal(after.target_cents, 300000, 'LEAK: alice\'s goal was modified by bob');
  });

  await t.test('bob cannot delete alice\'s contribution', async () => {
    const { data, error } = await bob.client
      .from('contribution')
      .delete()
      .eq('id', contribution.id)
      .select();
    assert.equal(error, null);
    assert.deepEqual(data, [], 'LEAK: bob deleted alice\'s contribution');

    const { data: after } = await alice.client
      .from('contribution')
      .select('id')
      .eq('id', contribution.id);
    assert.equal(after.length, 1, 'LEAK: alice\'s contribution is gone');
  });
});
