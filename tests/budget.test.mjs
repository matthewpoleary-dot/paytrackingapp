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
  contributionRate,
  goalStanding,
  duplicatedByOutgoings,
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

/* -- Where the goal stands -------------------------------------------------
   This is the arithmetic behind the one sentence the app must always be able
   to say, and three surfaces render it — the goal screen, /budget and the
   AI's get_goal tool. They used to assemble it separately, which is three
   chances to disagree about the same number. */

const gave = (cents, on) => ({ amount_cents: cents, contributed_on: on });

test('a rate needs two contributions, not one', () => {
  assert.equal(contributionRate([]), null);
  assert.equal(contributionRate([gave(10_000, '2026-01-01')]), null);
});

test('the rate is what was set aside per week, over the span it covers', () => {
  // 300 + 250 across exactly four weeks.
  const rate = contributionRate([gave(30_000, '2026-01-01'), gave(25_000, '2026-01-29')]);
  assert.equal(rate, Math.round(55_000 / 4));
});

test('the rate uses what was kept, never what was earned', () => {
  // Taking money back out lowers the rate; it is a withdrawal, not a gap.
  const kept = contributionRate([gave(40_000, '2026-01-01'), gave(-10_000, '2026-01-15')]);
  assert.equal(kept, Math.round(30_000 / 2));
});

test('standing reports late, and what would close it', () => {
  const standing = goalStanding({
    targetCents: 420_000,
    contributions: [gave(30_000, '2026-01-01'), gave(25_000, '2026-01-29')],
    today: '2026-01-29',
    deadline: '2026-06-01',
    typicalShiftCents: 9_300,
  });

  assert.equal(standing.savedCents, 55_000);
  assert.ok(standing.perWeekCents > 0);
  assert.equal(standing.arrival.reached, false);
  // Far short of 4,200 at 137.50 a week, so it cannot land by June.
  assert.ok(standing.arrival.weeksLate > 0);
  assert.ok(standing.extraShifts > 0, 'a late goal should say how many shifts close it');
});

test('standing offers no projection without a rate', () => {
  const standing = goalStanding({
    targetCents: 420_000,
    contributions: [gave(30_000, '2026-01-01')],
    today: '2026-01-29',
    deadline: '2026-06-01',
    typicalShiftCents: 9_300,
  });

  assert.equal(standing.perWeekCents, null);
  assert.equal(standing.arrival.arrivesOn, null);
  // No rate means no shift count either: inventing one would be the exact
  // failure the tool surface exists to prevent.
  assert.equal(standing.extraShifts, null);
});

test('a reached goal is reached, and says nothing about being late', () => {
  const standing = goalStanding({
    targetCents: 50_000,
    contributions: [gave(30_000, '2026-01-01'), gave(25_000, '2026-01-29')],
    today: '2026-01-29',
    deadline: '2026-06-01',
    typicalShiftCents: 9_300,
  });

  assert.equal(standing.arrival.reached, true);
  assert.equal(standing.arrival.remainingCents, 0);
  assert.equal(standing.extraShifts, null);
});

/* -- Rent is one payment, not two -----------------------------------------
   A recurring outgoing and its own bank line are the same money. Subtracting
   both understated the surplus by a month's rent and ran the goal projection
   about ten weeks pessimistic — and the model repeated it faithfully, because
   a tool had computed it. */

const RENT = 60_000;
const MONTH = ['2026-09-01', '2026-09-30'];

test('a commitment and its matching bank line are counted once', () => {
  // A weekly cadence over a seven-day window, so the pro-rata IS the actual
  // amount and all three figures are directly comparable. Over a month the
  // pro-rata differs from the payment by design — outgoingCostIn spreads a
  // commitment across an arbitrary window — and that is tested separately.
  const WEEK = ['2026-09-07', '2026-09-13'];
  const RENT_W = 15_000;
  const earned = 40_000;

  const o = outgoing({ amount_cents: RENT_W, cadence: 'weekly', category: 'rent' });
  const t = txn({ amount_cents: -RENT_W, category: 'rent', posted_on: '2026-09-08' });

  const outgoingOnly = cashflow(earned, [o], [], ...WEEK);
  const txnOnly = cashflow(earned, [], [t], ...WEEK);
  const both = cashflow(earned, [o], [t], ...WEEK);

  // The finding: recording it in both places must not charge it twice.
  assert.equal(outgoingOnly.surplusCents, txnOnly.surplusCents, 'fixture is comparable');
  assert.equal(both.surplusCents, outgoingOnly.surplusCents);
  assert.equal(both.surplusCents, txnOnly.surplusCents);
  assert.equal(both.surplusCents, earned - RENT_W);

  // Both figures stay independently visible.
  assert.equal(both.outgoingsCents, RENT_W, 'what they committed to');
  assert.equal(both.spendingCents, RENT_W, 'what actually left the account');
  assert.equal(both.duplicatedCents, RENT_W);
  assert.equal(both.discretionaryCents, 0);
});

test('over a month the commitment is the authority, not the bank line', () => {
  // outgoingCostIn pro-ratas a monthly commitment onto the window, so the
  // committed figure and the single payment differ. The bank line is then
  // evidence the commitment happened, not a second charge.
  const o = outgoing({ amount_cents: RENT, cadence: 'monthly', category: 'rent' });
  const t = txn({ amount_cents: -RENT, category: 'rent', posted_on: '2026-09-02' });

  const outgoingOnly = cashflow(120_000, [o], [], ...MONTH);
  const both = cashflow(120_000, [o], [t], ...MONTH);

  assert.equal(both.surplusCents, outgoingOnly.surplusCents);
  assert.equal(both.duplicatedCents, RENT);
  assert.equal(both.discretionaryCents, 0);
});

test('genuine spending on top of rent still counts', () => {
  const o = outgoing({ amount_cents: RENT, cadence: 'monthly', category: 'rent' });
  const rentLine = txn({ amount_cents: -RENT, category: 'rent', posted_on: '2026-09-02' });
  const shopping = txn({ amount_cents: -4_500, category: 'groceries', posted_on: '2026-09-10' });

  const flow = cashflow(120_000, [o], [rentLine, shopping], ...MONTH);
  assert.equal(flow.duplicatedCents, RENT);
  assert.equal(flow.discretionaryCents, 4_500);
  assert.equal(flow.surplusCents, 120_000 - flow.outgoingsCents - 4_500);
});

test('a second rent-sized payment in one month is NOT swallowed', () => {
  // Monthly cadence can produce one occurrence in a month. A second payment
  // of the same size is real spending — hiding it would be the opposite
  // mistake, and a worse one.
  const o = outgoing({ amount_cents: RENT, cadence: 'monthly', category: 'rent' });
  const first = txn({ amount_cents: -RENT, category: 'rent', posted_on: '2026-09-02' });
  const second = txn({ amount_cents: -RENT, category: 'rent', posted_on: '2026-09-20' });

  const flow = cashflow(200_000, [o], [first, second], ...MONTH);
  assert.equal(flow.duplicatedCents, RENT, 'only one occurrence is covered');
  assert.equal(flow.discretionaryCents, RENT);
});

test('matching is narrow: a different category or a different amount is not a duplicate', () => {
  const o = outgoing({ amount_cents: RENT, cadence: 'monthly', category: 'rent' });

  const wrongCategory = txn({ amount_cents: -RENT, category: 'shopping' });
  assert.equal(duplicatedByOutgoings([o], [wrongCategory], ...MONTH).cents, 0);

  // 1% of 60,000 is 600c; 2,000c out is well beyond it.
  const wrongAmount = txn({ amount_cents: -(RENT - 2_000), category: 'rent' });
  assert.equal(duplicatedByOutgoings([o], [wrongAmount], ...MONTH).cents, 0);

  // Just inside tolerance: a rent that moved by a few cents still matches.
  const nearlyRent = txn({ amount_cents: -(RENT + 300), category: 'rent' });
  assert.equal(duplicatedByOutgoings([o], [nearlyRent], ...MONTH).cents, RENT + 300);
});

test('an ended outgoing covers nothing', () => {
  const o = outgoing({
    amount_cents: RENT,
    cadence: 'monthly',
    category: 'rent',
    started_on: '2025-01-01',
    ended_on: '2026-08-31',
  });
  const t = txn({ amount_cents: -RENT, category: 'rent', posted_on: '2026-09-02' });
  assert.equal(duplicatedByOutgoings([o], [t], ...MONTH).cents, 0);
});
