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

test("RLS: one user cannot reach another user's budget, memory or conversations", async (t) => {
  const alice = await anonUser('alice');
  const bob = await anonUser('bob');
  assert.notEqual(alice.id, bob.id, 'the two sessions must be different users');

  // --- Alice builds a full v3 footprint -----------------------------------

  const { data: goal, error: goalErr } = await alice.client
    .from('goal')
    .insert({ user_id: alice.id, name: 'Erasmus', target_cents: 420000 })
    .select()
    .single();
  assert.equal(goalErr, null, `alice could not write her own goal: ${goalErr?.message}`);

  const { data: line, error: lineErr } = await alice.client
    .from('goal_line')
    .insert({
      user_id: alice.id,
      goal_id: goal.id,
      label: 'Flights',
      amount_cents: 24000,
      confidence: 'researched',
      source_url: 'https://example.com/flights',
      source_checked_on: '2026-09-21',
    })
    .select()
    .single();
  assert.equal(lineErr, null, `alice could not write her own goal line: ${lineErr?.message}`);

  const { data: outgoing, error: outErr } = await alice.client
    .from('outgoing')
    .insert({
      user_id: alice.id,
      label: 'Rent',
      amount_cents: 65000,
      cadence: 'monthly',
      category: 'rent',
      started_on: '2026-09-01',
    })
    .select()
    .single();
  assert.equal(outErr, null, `alice could not write her own outgoing: ${outErr?.message}`);

  const { data: txn, error: txnErr } = await alice.client
    .from('txn')
    .insert({
      user_id: alice.id,
      posted_on: '2026-09-20',
      description: 'Tesco',
      amount_cents: -3250,
      category: 'groceries',
      source: 'revolut_csv',
      external_id: 'rev-0001',
      categorised_by: 'model',
    })
    .select()
    .single();
  assert.equal(txnErr, null, `alice could not write her own transaction: ${txnErr?.message}`);

  const { data: fact, error: factErr } = await alice.client
    .from('profile_fact')
    .insert({
      user_id: alice.id,
      key: 'destination',
      value: 'Bologna',
      source: 'user',
      confirmed_at: new Date().toISOString(),
    })
    .select()
    .single();
  assert.equal(factErr, null, `alice could not write her own profile fact: ${factErr?.message}`);

  const { data: conversation, error: convErr } = await alice.client
    .from('conversation')
    .insert({ user_id: alice.id, title: 'Erasmus planning' })
    .select()
    .single();
  assert.equal(convErr, null, `alice could not start her own conversation: ${convErr?.message}`);

  const { data: message, error: msgErr } = await alice.client
    .from('ai_message')
    .insert({
      user_id: alice.id,
      conversation_id: conversation.id,
      role: 'user',
      content: [{ type: 'text', text: 'How much is rent in Bologna?' }],
    })
    .select()
    .single();
  assert.equal(msgErr, null, `alice could not write her own message: ${msgErr?.message}`);

  const TABLES = ['goal_line', 'outgoing', 'txn', 'profile_fact', 'conversation', 'ai_message'];

  // --- Positive half: the rows exist and their owner can see them ---------

  await t.test('alice can read her own v3 rows', async () => {
    for (const table of TABLES) {
      const { data, error } = await alice.client.from(table).select('id');
      assert.equal(error, null, `alice got an error reading ${table}: ${error?.message}`);
      assert.ok(
        data.length > 0,
        `alice sees no rows in ${table} — the negative assertions below would be vacuous`,
      );
    }
  });

  // --- Negative half -------------------------------------------------------

  await t.test("bob cannot read any of alice's v3 rows", async () => {
    for (const table of TABLES) {
      const { data, error } = await bob.client.from(table).select('*');
      assert.equal(error, null, `unexpected error reading ${table}: ${error?.message}`);
      assert.deepEqual(data, [], `LEAK: bob can see ${data?.length} row(s) in ${table}`);
    }
  });

  await t.test("bob cannot read alice's rows by primary key", async () => {
    for (const [table, row] of [
      ['goal_line', line],
      ['outgoing', outgoing],
      ['txn', txn],
      ['profile_fact', fact],
      ['conversation', conversation],
      ['ai_message', message],
    ]) {
      const { data, error } = await bob.client.from(table).select('*').eq('id', row.id);
      assert.equal(error, null);
      assert.deepEqual(data, [], `LEAK: bob fetched alice's ${table} by primary key`);
    }
  });

  await t.test('bob cannot read what the model wrote about alice', async () => {
    // The conversation is the most sensitive thing here: it is the only place
    // holding free text about someone's money.
    const { data } = await bob.client
      .from('ai_message')
      .select('content')
      .eq('conversation_id', conversation.id);
    assert.deepEqual(data, [], "LEAK: bob can read alice's conversation");
  });

  await t.test('bob cannot attach rows to alice', async () => {
    const attempts = [
      ['goal_line', { user_id: alice.id, goal_id: goal.id, label: 'X', amount_cents: 100 }],
      [
        'outgoing',
        {
          user_id: alice.id,
          label: 'X',
          amount_cents: 100,
          cadence: 'monthly',
          started_on: '2026-09-01',
        },
      ],
      ['txn', { user_id: alice.id, posted_on: '2026-09-21', description: 'X', amount_cents: -100 }],
      ['profile_fact', { user_id: alice.id, key: 'k', value: 'v', source: 'model' }],
      ['conversation', { user_id: alice.id, title: 'X' }],
      [
        'ai_message',
        { user_id: alice.id, conversation_id: conversation.id, role: 'user', content: [] },
      ],
    ];
    for (const [table, row] of attempts) {
      const { error } = await bob.client.from(table).insert(row);
      assert.ok(error, `LEAK: bob wrote a ${table} row under alice's user_id`);
      assert.match(error.message, /row-level security/i, `${table}: wrong refusal`);
    }
  });

  await t.test("bob cannot rewrite alice's goal line or its citation", async () => {
    const { data, error } = await bob.client
      .from('goal_line')
      .update({ amount_cents: 1, source_url: 'https://evil.example' })
      .eq('id', line.id)
      .select();
    assert.equal(error, null);
    assert.deepEqual(data, [], "LEAK: bob updated alice's goal line");

    const { data: after } = await alice.client
      .from('goal_line')
      .select('amount_cents, source_url')
      .eq('id', line.id)
      .single();
    assert.equal(after.amount_cents, 24000, "LEAK: alice's figure was changed");
    assert.equal(
      after.source_url,
      'https://example.com/flights',
      "LEAK: alice's citation was changed",
    );
  });

  await t.test("bob cannot delete alice's transactions or memory", async () => {
    for (const [table, row] of [
      ['txn', txn],
      ['profile_fact', fact],
    ]) {
      const { data, error } = await bob.client.from(table).delete().eq('id', row.id).select();
      assert.equal(error, null);
      assert.deepEqual(data, [], `LEAK: bob deleted alice's ${table}`);

      const { data: after } = await alice.client.from(table).select('id').eq('id', row.id);
      assert.equal(after.length, 1, `LEAK: alice's ${table} row is gone`);
    }
  });
});

// ---------------------------------------------------------------------------
// Constraints that are guarantees rather than requests. Not RLS, but they
// protect the same thing: a figure the user could not stand over.
// ---------------------------------------------------------------------------

test('the schema refuses unsourced research and unconfirmed user facts', async (t) => {
  const user = await anonUser('constraints');

  const { data: goal } = await user.client
    .from('goal')
    .insert({ user_id: user.id, name: 'Erasmus', target_cents: 420000 })
    .select()
    .single();

  await t.test('a researched line without a citation is rejected', async () => {
    const { error } = await user.client.from('goal_line').insert({
      user_id: user.id,
      goal_id: goal.id,
      label: 'Rent in Bologna',
      amount_cents: 50000,
      confidence: 'researched',
    });
    assert.ok(error, 'a researched figure was accepted with no source');
    assert.match(error.message, /goal_line_researched_is_sourced|violates check/i);
  });

  await t.test('a guess needs no citation', async () => {
    const { error } = await user.client.from('goal_line').insert({
      user_id: user.id,
      goal_id: goal.id,
      label: 'Spending money',
      amount_cents: 60000,
      confidence: 'guess',
    });
    assert.equal(error, null, `a guess was wrongly rejected: ${error?.message}`);
  });

  await t.test('a user-sourced fact cannot be left unconfirmed', async () => {
    const { error } = await user.client.from('profile_fact').insert({
      user_id: user.id,
      key: 'unconfirmed-user-fact',
      value: 'x',
      source: 'user',
    });
    assert.ok(error, 'a user fact was accepted without confirmation');
    assert.match(error.message, /profile_fact_user_facts_are_confirmed|violates check/i);
  });

  await t.test('a model-sourced fact may be left unconfirmed', async () => {
    const { error } = await user.client.from('profile_fact').insert({
      user_id: user.id,
      key: 'model-pending-fact',
      value: 'Bologna',
      source: 'model',
    });
    assert.equal(error, null, `a pending model fact was wrongly rejected: ${error?.message}`);
  });

  await t.test('re-importing the same statement line does not double-count', async () => {
    const row = {
      user_id: user.id,
      posted_on: '2026-09-20',
      description: 'Tesco',
      amount_cents: -3250,
      source: 'revolut_csv',
      external_id: 'rev-dupe-001',
    };
    const first = await user.client.from('txn').insert(row);
    assert.equal(first.error, null, `first import failed: ${first.error?.message}`);

    const second = await user.client.from('txn').insert(row);
    assert.ok(second.error, 'the same statement line imported twice');
    assert.match(second.error.message, /duplicate key|txn_external_once/i);
  });

  await t.test('two hand-entered transactions may look identical', async () => {
    // Null external_id is excluded from the unique index on purpose: buying
    // the same coffee twice in a day is not a duplicate.
    const row = {
      user_id: user.id,
      posted_on: '2026-09-20',
      description: 'Coffee',
      amount_cents: -350,
      source: 'manual',
    };
    assert.equal((await user.client.from('txn').insert(row)).error, null);
    assert.equal(
      (await user.client.from('txn').insert(row)).error,
      null,
      'manual duplicates blocked',
    );
  });
});
