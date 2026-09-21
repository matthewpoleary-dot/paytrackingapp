// Budget arithmetic. No database, no browser.
//
// The cases that matter here are the ones where a plausible-looking shortcut
// gives the wrong answer: an outgoing that ended mid-window, a transfer to
// savings counted as spending, a monthly figure pro-rata'd onto a fortnight.
//
//   npm run test:budget

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  daysInclusive,
  outgoingActiveIn,
  outgoingCostIn,
  outgoingsTotalIn,
  outgoingPerWeek,
  spendingByCategory,
  totalSpending,
  transfersIn,
  goalTarget,
  cashflow,
  goalArrival,
  shiftsToClose,
} = await import('../lib/budget/calc.ts');
const { isSpending, SPEND_CATEGORIES } = await import('../lib/budget/types.ts');
const { sumCents } = await import('../lib/pay/money.ts');

const outgoing = (o = {}) => ({
  id: Math.random().toString(36).slice(2),
  label: 'Thing',
  amount_cents: 10000,
  cadence: 'monthly',
  category: 'bills',
  started_on: '2026-01-01',
  ended_on: null,
  ...o,
});

const txn = (t = {}) => ({
  id: Math.random().toString(36).slice(2),
  posted_on: '2026-09-15',
  description: 'Thing',
  amount_cents: -1000,
  category: 'groceries',
  categorised_by: 'user',
  source: 'manual',
  external_id: null,
  ...t,
});

// ---------------------------------------------------------------------------
test('date windows', async (t) => {
  await t.test('inclusive on both ends', () => {
    assert.equal(daysInclusive('2026-09-01', '2026-09-01'), 1);
    assert.equal(daysInclusive('2026-09-01', '2026-09-07'), 7);
    assert.equal(daysInclusive('2026-09-01', '2026-09-30'), 30);
  });

  await t.test('spans months and leap years', () => {
    assert.equal(daysInclusive('2026-12-31', '2027-01-01'), 2);
    assert.equal(daysInclusive('2028-02-01', '2028-02-29'), 29);
  });
});

// ---------------------------------------------------------------------------
test('outgoings', async (t) => {
  await t.test('an outgoing is active only while it was live', () => {
    const o = outgoing({ started_on: '2026-03-01', ended_on: '2026-06-30' });
    assert.equal(outgoingActiveIn(o, '2026-01-01', '2026-02-28'), false, 'before it started');
    assert.equal(outgoingActiveIn(o, '2026-07-01', '2026-08-31'), false, 'after it ended');
    assert.equal(outgoingActiveIn(o, '2026-04-01', '2026-04-30'), true, 'during');
    assert.equal(outgoingActiveIn(o, '2026-02-01', '2026-04-01'), true, 'overlapping the start');
  });

  await t.test('a weekly outgoing costs its amount over a week', () => {
    const o = outgoing({ amount_cents: 2000, cadence: 'weekly' });
    assert.equal(outgoingCostIn(o, '2026-09-01', '2026-09-07'), 2000);
  });

  await t.test('a monthly outgoing pro-ratas onto a fortnight', () => {
    // 650.00/month over 14 days of an average 30.44-day month.
    const o = outgoing({ amount_cents: 65000, cadence: 'monthly' });
    const cost = outgoingCostIn(o, '2026-09-01', '2026-09-14');
    assert.ok(cost > 29000 && cost < 31000, `expected roughly half a month, got ${cost}`);
  });

  await t.test('an outgoing that ended mid-window is only charged while it was live', () => {
    const full = outgoing({ amount_cents: 65000, cadence: 'monthly' });
    const half = outgoing({ amount_cents: 65000, cadence: 'monthly', ended_on: '2026-09-15' });
    const a = outgoingCostIn(full, '2026-09-01', '2026-09-30');
    const b = outgoingCostIn(half, '2026-09-01', '2026-09-30');
    assert.ok(b < a, 'an ended outgoing cost less than a live one');
    assert.ok(b > 0, 'but it still cost something for the days it ran');
  });

  await t.test('an outgoing that starts mid-window is not charged for before', () => {
    const o = outgoing({ amount_cents: 65000, cadence: 'monthly', started_on: '2026-09-16' });
    const partial = outgoingCostIn(o, '2026-09-01', '2026-09-30');
    const whole = outgoingCostIn(outgoing({ amount_cents: 65000 }), '2026-09-01', '2026-09-30');
    assert.ok(partial < whole);
  });

  await t.test('an outgoing outside the window costs nothing', () => {
    const o = outgoing({ started_on: '2027-01-01' });
    assert.equal(outgoingCostIn(o, '2026-09-01', '2026-09-30'), 0);
  });

  await t.test('the bill is the sum of the rounded parts, so rows add up', () => {
    const items = [
      outgoing({ amount_cents: 65000, cadence: 'monthly', label: 'Rent' }),
      outgoing({ amount_cents: 3500, cadence: 'weekly', label: 'Phone' }),
      outgoing({ amount_cents: 12000, cadence: 'yearly', label: 'Insurance' }),
    ];
    const parts = items.map((o) => outgoingCostIn(o, '2026-09-01', '2026-09-30'));
    assert.equal(outgoingsTotalIn(items, '2026-09-01', '2026-09-30'), sumCents(parts));
  });

  await t.test('cadences normalise to a comparable weekly figure', () => {
    assert.equal(outgoingPerWeek(outgoing({ amount_cents: 2000, cadence: 'weekly' })), 2000);
    assert.equal(outgoingPerWeek(outgoing({ amount_cents: 4000, cadence: 'fortnightly' })), 2000);
    const monthly = outgoingPerWeek(outgoing({ amount_cents: 65000, cadence: 'monthly' }));
    assert.ok(monthly > 14000 && monthly < 16000, `got ${monthly}`);
    const yearly = outgoingPerWeek(outgoing({ amount_cents: 52000, cadence: 'yearly' }));
    assert.ok(yearly > 900 && yearly < 1100, `got ${yearly}`);
  });

  await t.test('every cadence returns an integer', () => {
    for (const cadence of ['weekly', 'fortnightly', 'monthly', 'yearly']) {
      const cents = outgoingCostIn(outgoing({ cadence }), '2026-09-01', '2026-09-30');
      assert.equal(cents, Math.trunc(cents), `${cadence} produced a float`);
    }
  });
});

// ---------------------------------------------------------------------------
test('spending', async (t) => {
  const window = ['2026-09-01', '2026-09-30'];

  await t.test('a transfer to savings is not spending', () => {
    assert.equal(isSpending('transfer'), false);
    const totals = spendingByCategory(
      [txn({ category: 'transfer', amount_cents: -20000 }), txn({ amount_cents: -1000 })],
      ...window,
    );
    assert.equal(totals.length, 1);
    assert.equal(totals[0].category, 'groceries');
  });

  await t.test('wages landing are not a negative expense', () => {
    assert.equal(isSpending('income'), false);
    assert.equal(totalSpending([txn({ category: 'income', amount_cents: 50000 })], ...window), 0);
  });

  await t.test('money in is never counted as spending, whatever its category', () => {
    // A refund lands as a positive amount on a spending category.
    assert.equal(totalSpending([txn({ category: 'shopping', amount_cents: 4000 })], ...window), 0);
  });

  await t.test('totals are positive, and sorted heaviest first', () => {
    const totals = spendingByCategory(
      [
        txn({ category: 'groceries', amount_cents: -1000 }),
        txn({ category: 'rent', amount_cents: -65000 }),
        txn({ category: 'groceries', amount_cents: -2000 }),
      ],
      ...window,
    );
    assert.equal(totals[0].category, 'rent');
    assert.equal(totals[0].cents, 65000);
    assert.equal(totals[1].category, 'groceries');
    assert.equal(totals[1].cents, 3000);
    assert.equal(totals[1].count, 2);
  });

  await t.test('transactions outside the window are ignored', () => {
    const outside = [txn({ posted_on: '2026-08-31' }), txn({ posted_on: '2026-10-01' })];
    assert.equal(totalSpending(outside, ...window), 0);
  });

  await t.test('the total equals the sum of its categories', () => {
    const txns = [
      txn({ category: 'groceries', amount_cents: -1234 }),
      txn({ category: 'transport', amount_cents: -567 }),
      txn({ category: 'transfer', amount_cents: -20000 }),
    ];
    const byCat = spendingByCategory(txns, ...window);
    assert.equal(totalSpending(txns, ...window), sumCents(byCat.map((c) => c.cents)));
  });

  await t.test('transfers are counted separately, as savings', () => {
    const txns = [txn({ category: 'transfer', amount_cents: -20000 })];
    assert.equal(transfersIn(txns, ...window), 20000);
  });

  await t.test('every category is either spending or explicitly not', () => {
    for (const c of SPEND_CATEGORIES) assert.equal(typeof isSpending(c), 'boolean');
  });
});

// ---------------------------------------------------------------------------
test('the goal target is the sum of its lines', async (t) => {
  const line = (amount, confidence) => ({
    id: String(Math.random()),
    goal_id: 'g',
    label: 'x',
    amount_cents: amount,
    confidence,
    source_url: null,
    source_checked_on: null,
    sort_order: 0,
  });

  await t.test('no lines means no target', () => {
    const t0 = goalTarget([]);
    assert.equal(t0.cents, 0);
    assert.equal(t0.weakest, null);
  });

  await t.test('the total is only as good as its weakest line', () => {
    assert.equal(goalTarget([line(1000, 'quoted')]).weakest, 'quoted');
    assert.equal(goalTarget([line(1000, 'quoted'), line(500, 'researched')]).weakest, 'researched');
    assert.equal(
      goalTarget([line(1000, 'quoted'), line(500, 'researched'), line(1, 'guess')]).weakest,
      'guess',
      'one guess makes the whole total a guess',
    );
  });

  await t.test('the confidence split adds back up to the total', () => {
    const t0 = goalTarget([line(1000, 'quoted'), line(500, 'researched'), line(250, 'guess')]);
    assert.equal(t0.cents, 1750);
    assert.equal(t0.quotedCents + t0.researchedCents + t0.guessCents, t0.cents);
  });
});

// ---------------------------------------------------------------------------
test('cashflow', async (t) => {
  await t.test('surplus is earnings less commitments less spending', () => {
    const c = cashflow(
      100000,
      [outgoing({ amount_cents: 2000, cadence: 'weekly' })],
      [txn({ amount_cents: -5000, posted_on: '2026-09-03' })],
      '2026-09-01',
      '2026-09-07',
    );
    assert.equal(c.outgoingsCents, 2000);
    assert.equal(c.spendingCents, 5000);
    assert.equal(c.surplusCents, 93000);
    assert.equal(c.perWeekCents, 93000, 'a seven-day window is already a week');
  });

  await t.test('surplus can be negative, and says so rather than clamping', () => {
    const c = cashflow(1000, [outgoing({ amount_cents: 50000, cadence: 'weekly' })], [], '2026-09-01', '2026-09-07');
    assert.ok(c.surplusCents < 0);
  });

  await t.test('the weekly rate scales with the window', () => {
    const fortnight = cashflow(200000, [], [], '2026-09-01', '2026-09-14');
    assert.equal(fortnight.days, 14);
    assert.equal(fortnight.perWeekCents, 100000);
  });
});

// ---------------------------------------------------------------------------
test('when the goal is reached', async (t) => {
  await t.test('the sentence the app exists to say', () => {
    // 4200 target, 1150 saved, 100/week => 3050 to go => 31 weeks.
    const a = goalArrival(420000, 115000, 10000, '2026-09-21', '2027-08-01');
    assert.equal(a.remainingCents, 305000);
    assert.equal(a.weeksRemaining, 31);
    assert.equal(a.arrivesOn, '2027-04-26');
    assert.equal(a.weeksLate, null, 'April is before the August deadline');
  });

  await t.test('being late is counted in weeks, not hidden', () => {
    const a = goalArrival(420000, 115000, 10000, '2026-09-21', '2027-01-01');
    assert.ok(a.weeksLate !== null && a.weeksLate > 0, 'a late arrival is flagged');
  });

  await t.test('no target means no projection, and says why', () => {
    const a = goalArrival(0, 0, 10000, '2026-09-21', null);
    assert.equal(a.arrivesOn, null);
    assert.match(a.reason, /No target/);
  });

  await t.test('saving nothing is not a rate', () => {
    const a = goalArrival(420000, 1000, 0, '2026-09-21', null);
    assert.equal(a.weeksRemaining, null);
    assert.match(a.reason, /Nothing is being set aside/);
  });

  await t.test('an unknown rate is not treated as zero', () => {
    const a = goalArrival(420000, 1000, null, '2026-09-21', null);
    assert.equal(a.weeksRemaining, null);
    assert.match(a.reason, /Not enough history/);
  });

  await t.test('a reached target stops projecting', () => {
    const a = goalArrival(420000, 420000, 10000, '2026-09-21', '2027-08-01');
    assert.equal(a.reached, true);
    assert.equal(a.remainingCents, 0);
    assert.equal(a.reason, null);
  });

  await t.test('extra shifts close the gap, rounded up', () => {
    assert.equal(shiftsToClose(30000, 9300), 4, 'never a fraction of a shift');
    assert.equal(shiftsToClose(0, 9300), 0);
    assert.equal(shiftsToClose(-500, 9300), 0, 'already there');
    assert.equal(shiftsToClose(30000, 0), null, 'a worthless shift closes nothing');
  });
});
