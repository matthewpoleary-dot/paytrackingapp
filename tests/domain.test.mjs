// Domain tests. No database, no browser — just the arithmetic the whole app
// rests on. These are the cases a walkthrough cannot reach: the October night
// that is nine hours long, a shift that ends before it starts, a month with
// 28 days, a rate change that must not reach backwards.
//
//   npm run test:domain

import test from 'node:test';
import assert from 'node:assert/strict';
const {
  roundToCents,
  payForMinutes,
  parseRateToCents,
  sumCents,
  formatCents,
} = await import('../lib/pay/money.ts');
const { dublinInstant, shiftInstants, addDays, dublinDate, formatDublinTime } = await import(
  '../lib/time/dublin.ts'
);
const { valueShift, valuePeriod, formatMinutes } = await import('../lib/pay/calc.ts');
const { periodEnd, nextPeriodStart, previousPeriodStart } = await import('../lib/pay/period.ts');
const { rangeContaining, stepRange, startOfWeek, relativeLabel } = await import(
  '../lib/pay/range.ts'
);
const { aggregate, byDay, byWeek, provisionalNote } = await import('../lib/pay/aggregate.ts');
const { project } = await import('../lib/pay/projection.ts');

const SETTINGS = {
  id: 's',
  user_id: 'u',
  hourly_rate_cents: 1550,
  breaks_paid: false,
  pay_period_length: 'weekly',
  period_anchor_date: '2026-09-07',
  sunday_premium_kind: null,
  sunday_premium_cents_per_hour: null,
  sunday_premium_basis_points: null,
  default_break_minutes: 30,
};

let n = 0;
function shift(overrides = {}) {
  const workDate = overrides.work_date ?? '2026-09-18';
  const start = overrides.start ?? '17:00';
  const end = overrides.end ?? '23:30';
  const { startAt, endAt } = shiftInstants(workDate, start, end);
  return {
    id: `shift-${n++}`,
    user_id: 'u',
    work_date: workDate,
    planned_start_at: startAt.toISOString(),
    planned_end_at: endAt.toISOString(),
    actual_end_at: null,
    planned_break_minutes: 30,
    actual_break_minutes: null,
    actuals_confirmed_at: null,
    source: 'manual',
    hourly_rate_cents: 1550,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
test('money', async (t) => {
  await t.test('rounds half up, at the cent', () => {
    assert.equal(roundToCents(100.4), 100);
    assert.equal(roundToCents(100.5), 101);
    assert.equal(roundToCents(100.6), 101);
    assert.equal(roundToCents(0), 0);
  });

  await t.test('pay for minutes rounds once', () => {
    // 6h at 15.50 is exactly 93.00
    assert.equal(payForMinutes(360, 1550), 9300);
    // 8h20m at 15.50 is 129.1666… -> 129.17
    assert.equal(payForMinutes(500, 1550), 12917);
    assert.equal(payForMinutes(0, 1550), 0);
  });

  await t.test('a period total is the sum of rounded shifts, so rows add up', () => {
    const parts = [payForMinutes(500, 1550), payForMinutes(360, 1550), payForMinutes(360, 1550)];
    assert.equal(sumCents(parts), 31517);
    assert.equal(formatCents(sumCents(parts)), '€315.17');
  });

  await t.test('parses what people actually type, and refuses what it cannot read', () => {
    assert.equal(parseRateToCents('13.85'), 1385);
    assert.equal(parseRateToCents('13,85'), 1385);
    assert.equal(parseRateToCents('€13.85'), 1385);
    assert.equal(parseRateToCents(' 13 '), 1300);
    assert.equal(parseRateToCents('13.5'), 1350);
    assert.equal(parseRateToCents(''), null);
    assert.equal(parseRateToCents('abc'), null);
    assert.equal(parseRateToCents('-5'), null);
    assert.equal(parseRateToCents('0'), null);
    assert.equal(parseRateToCents('13.856'), null);
  });
});

// ---------------------------------------------------------------------------
test('Dublin time', async (t) => {
  await t.test('a shift ending before it starts runs past midnight', () => {
    const { startAt, endAt } = shiftInstants('2026-09-18', '18:00', '01:20');
    assert.equal((endAt - startAt) / 60000, 440, '7h20m');
  });

  await t.test('same start and end is not treated as zero', () => {
    const { startAt, endAt } = shiftInstants('2026-09-18', '18:00', '18:00');
    assert.equal((endAt - startAt) / 60000, 1440, 'a full day, not nothing');
  });

  await t.test('the October clock change makes a night NINE hours, not eight', () => {
    // Clocks go back 02:00 -> 01:00 on Sunday 25 October 2026.
    const { startAt, endAt } = shiftInstants('2026-10-24', '21:00', '05:00');
    assert.equal((endAt - startAt) / 60000, 540, '9 hours of real elapsed time');
  });

  await t.test('the March clock change makes a night SEVEN hours, not eight', () => {
    // Clocks go forward 01:00 -> 02:00 on Sunday 29 March 2026.
    const { startAt, endAt } = shiftInstants('2026-03-28', '21:00', '05:00');
    assert.equal((endAt - startAt) / 60000, 420, '7 hours of real elapsed time');
  });

  await t.test('wall clock survives the round trip in both offsets', () => {
    assert.equal(dublinInstant('2026-01-15', '18:00').toISOString(), '2026-01-15T18:00:00.000Z');
    // BST: Dublin is UTC+1 in July.
    assert.equal(dublinInstant('2026-07-15', '18:00').toISOString(), '2026-07-15T17:00:00.000Z');
  });

  await t.test('addDays crosses month and year ends', () => {
    assert.equal(addDays('2026-01-31', 1), '2026-02-01');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2028-03-01', -1), '2028-02-29', 'leap year');
  });

  await t.test('times render in Dublin, not UTC', () => {
    assert.equal(formatDublinTime('2026-07-15T17:00:00.000Z'), '6pm');
    assert.equal(formatDublinTime('2026-01-15T18:00:00.000Z'), '6pm');
  });
});

// ---------------------------------------------------------------------------
test('valuing a shift', async (t) => {
  await t.test('unpaid break is deducted', () => {
    // 17:00-23:30 is 6h30m, less a 30m break = 6h.
    const v = valueShift(shift(), SETTINGS);
    assert.equal(v.paidMinutes, 360);
    assert.equal(v.cents, 9300);
    assert.equal(v.estimated, true);
  });

  await t.test('paid breaks are not deducted', () => {
    const v = valueShift(shift(), { ...SETTINGS, breaks_paid: true });
    assert.equal(v.paidMinutes, 390);
    assert.equal(v.cents, 10075);
  });

  await t.test('actuals override the plan once confirmed', () => {
    const s = shift({
      actual_end_at: shiftInstants('2026-09-18', '17:00', '01:20').endAt.toISOString(),
      actual_break_minutes: 0,
      actuals_confirmed_at: '2026-09-19T10:00:00.000Z',
    });
    const v = valueShift(s, SETTINGS);
    assert.equal(v.paidMinutes, 500, '8h20m, no break taken');
    assert.equal(v.cents, 12917);
    assert.equal(v.estimated, false);
  });

  await t.test('a shift carries the rate it was worked at, not the current one', () => {
    const s = shift({ hourly_rate_cents: 1200 });
    // Settings say 15.50; the shift says 12.00. The shift wins.
    assert.equal(valueShift(s, SETTINGS).cents, payForMinutes(360, 1200));
  });

  await t.test('a break longer than the shift cannot produce negative pay', () => {
    const s = shift({ start: '17:00', end: '17:15', planned_break_minutes: 60 });
    const v = valueShift(s, SETTINGS);
    assert.equal(v.paidMinutes, 0);
    assert.equal(v.cents, 0);
  });

  await t.test('Sunday hours are counted, and flagged when no premium exists', () => {
    const s = shift({ work_date: '2026-09-20', start: '15:00', end: '21:00' });
    const v = valueShift(s, SETTINGS);
    assert.ok(v.sundayMinutes > 0, 'Sunday minutes detected');
    assert.equal(v.sundayWithoutPremium, true, 'no premium recorded, so flagged');
  });

  await t.test('a per-hour Sunday premium is applied only to Sunday minutes', () => {
    const sunday = { ...SETTINGS, sunday_premium_kind: 'per_hour', sunday_premium_cents_per_hour: 200 };
    const s = shift({ work_date: '2026-09-20', start: '15:00', end: '21:00', planned_break_minutes: 0 });
    const v = valueShift(s, sunday);
    assert.equal(v.paidMinutes, 360);
    assert.equal(v.cents, payForMinutes(360, 1750), '6h at 15.50 + 2.00');
    assert.equal(v.sundayWithoutPremium, false);
  });

  await t.test('a multiplier is applied without ever becoming a float', () => {
    const sunday = { ...SETTINGS, sunday_premium_kind: 'multiplier', sunday_premium_basis_points: 15000 };
    const s = shift({ work_date: '2026-09-20', start: '15:00', end: '21:00', planned_break_minutes: 0 });
    assert.equal(valueShift(s, sunday).cents, payForMinutes(360, 2325), '1.5x of 15.50');
  });

  await t.test('a Saturday night crossing into Sunday splits its hours', () => {
    const s = shift({ work_date: '2026-09-19', start: '22:00', end: '02:00', planned_break_minutes: 0 });
    const v = valueShift(s, SETTINGS);
    assert.equal(v.paidMinutes, 240);
    assert.equal(v.sundayMinutes, 120, 'midnight to 2am is Sunday');
  });

  await t.test("'none' and 'not sure' both add nothing, but only one is flagged", () => {
    const s = shift({ work_date: '2026-09-20', start: '15:00', end: '21:00' });
    const declared = valueShift(s, { ...SETTINGS, sunday_premium_kind: 'none' });
    const unknown = valueShift(s, { ...SETTINGS, sunday_premium_kind: null });
    assert.equal(declared.cents, unknown.cents, 'neither adds money');
    assert.equal(declared.sundayWithoutPremium, true);
    assert.equal(unknown.sundayWithoutPremium, true);
  });
});

// ---------------------------------------------------------------------------
test('aggregates stay honest', async (t) => {
  const confirmed = shift({
    work_date: '2026-09-15',
    actual_end_at: shiftInstants('2026-09-15', '17:00', '23:30').endAt.toISOString(),
    actual_break_minutes: 30,
    actuals_confirmed_at: '2026-09-16T09:00:00.000Z',
  });
  const pending = shift({ work_date: '2026-09-18' });

  await t.test('one unconfirmed shift makes the whole aggregate estimated', () => {
    const a = aggregate([confirmed, pending], SETTINGS);
    assert.equal(a.estimated, true);
    assert.equal(a.shiftCount, 2);
    assert.equal(a.confirmedCount, 1);
  });

  await t.test('all confirmed means not estimated', () => {
    assert.equal(aggregate([confirmed], SETTINGS).estimated, false);
  });

  await t.test('confirmed and estimated cents split, and sum to the total', () => {
    const a = aggregate([confirmed, pending], SETTINGS);
    assert.equal(a.confirmedCents + a.estimatedCents, a.cents);
    assert.ok(a.confirmedCents > 0 && a.estimatedCents > 0);
  });

  await t.test('an empty aggregate is not estimated and not negative', () => {
    const a = aggregate([], SETTINGS);
    assert.equal(a.cents, 0);
    assert.equal(a.estimated, false);
    assert.equal(provisionalNote(a), null);
  });

  await t.test('grouping by day and by week both preserve the total', () => {
    const all = [confirmed, pending];
    const total = aggregate(all, SETTINGS).cents;
    const dayTotal = [...byDay(all, SETTINGS).values()].reduce((s, d) => s + d.cents, 0);
    const weekTotal = [...byWeek(all, SETTINGS).values()].reduce((s, w) => s + w.cents, 0);
    assert.equal(dayTotal, total);
    assert.equal(weekTotal, total);
  });

  await t.test('valuePeriod agrees with aggregate', () => {
    const all = [confirmed, pending];
    assert.equal(valuePeriod(all, SETTINGS).cents, aggregate(all, SETTINGS).cents);
  });
});

// ---------------------------------------------------------------------------
test('pay periods', async (t) => {
  await t.test('weekly and fortnightly are inclusive ranges', () => {
    assert.equal(periodEnd('2026-09-07', 'weekly'), '2026-09-13');
    assert.equal(periodEnd('2026-09-07', 'fortnightly'), '2026-09-20');
  });

  await t.test('monthly handles short months and leap years', () => {
    assert.equal(periodEnd('2026-02-01', 'monthly'), '2026-02-28');
    assert.equal(periodEnd('2028-02-01', 'monthly'), '2028-02-29');
    assert.equal(periodEnd('2026-04-01', 'monthly'), '2026-04-30');
    assert.equal(periodEnd('2026-12-01', 'monthly'), '2026-12-31');
  });

  await t.test('stepping forward then back returns to the start', () => {
    for (const length of ['weekly', 'fortnightly', 'monthly']) {
      const start = '2026-09-01';
      assert.equal(previousPeriodStart(nextPeriodStart(start, length), length), start, length);
    }
  });

  await t.test('stepping back over a year boundary works', () => {
    assert.equal(previousPeriodStart('2026-01-01', 'monthly'), '2025-12-01');
    assert.equal(previousPeriodStart('2026-01-05', 'weekly'), '2025-12-29');
  });
});

// ---------------------------------------------------------------------------
test('dashboard ranges', async (t) => {
  await t.test('weeks start Monday, whatever day you ask about', () => {
    assert.equal(startOfWeek('2026-09-21'), '2026-09-21', 'a Monday');
    assert.equal(startOfWeek('2026-09-27'), '2026-09-21', 'a Sunday');
    assert.equal(startOfWeek('2026-09-24'), '2026-09-21', 'a Thursday');
  });

  await t.test('each range covers exactly what it says', () => {
    assert.deepEqual(rangeContaining('week', '2026-09-24'), {
      kind: 'week',
      from: '2026-09-21',
      to: '2026-09-27',
    });
    assert.deepEqual(rangeContaining('month', '2026-02-15'), {
      kind: 'month',
      from: '2026-02-01',
      to: '2026-02-28',
    });
    assert.deepEqual(rangeContaining('year', '2026-06-06'), {
      kind: 'year',
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  await t.test('stepping is reversible for every range', () => {
    for (const kind of ['week', 'month', 'year']) {
      const start = rangeContaining(kind, '2026-09-24');
      assert.deepEqual(stepRange(stepRange(start, 1), -1), start, kind);
    }
  });

  await t.test('stepping crosses year boundaries', () => {
    assert.equal(stepRange(rangeContaining('month', '2026-12-10'), 1).from, '2027-01-01');
    assert.equal(stepRange(rangeContaining('month', '2026-01-10'), -1).from, '2025-12-01');
  });

  await t.test('relative labels only claim what they can', () => {
    const today = '2026-09-24';
    assert.equal(relativeLabel(rangeContaining('week', today), today), 'This week');
    assert.equal(relativeLabel(rangeContaining('week', '2026-09-17'), today), 'Last week');
    assert.equal(relativeLabel(rangeContaining('week', '2026-10-01'), today), 'Next week');
    // Far enough away that a relative phrase would make the reader count.
    assert.match(relativeLabel(rangeContaining('week', '2026-05-04'), today), /May/);
  });
});

// ---------------------------------------------------------------------------
test('savings projection', async (t) => {
  const goal = { id: 'g', name: 'Deposit', target_cents: 100000, target_date: null };
  const contribution = (amount, on) => ({ id: on, amount_cents: amount, contributed_on: on, note: null });

  await t.test('refuses to project from nothing', () => {
    const p = project(goal, [], '2026-09-21');
    assert.equal(p.weeksRemaining, null);
    assert.ok(p.reason);
  });

  await t.test('refuses to project from a single contribution', () => {
    const p = project(goal, [contribution(10000, '2026-09-07')], '2026-09-21');
    assert.equal(p.weeksRemaining, null);
    assert.match(p.reason, /not a rate/);
  });

  await t.test('projects from the span contributions cover, not from today', () => {
    // 200 over 2 weeks = 100/week; 800 left => 8 weeks.
    const p = project(goal, [contribution(10000, '2026-09-07'), contribution(10000, '2026-09-21')], '2026-09-21');
    assert.equal(p.perWeekCents, 10000);
    assert.equal(p.weeksRemaining, 8);
    assert.equal(p.savedCents, 20000);
  });

  await t.test('withdrawals reduce the total and can cancel the rate', () => {
    const p = project(goal, [contribution(10000, '2026-09-07'), contribution(-10000, '2026-09-21')], '2026-09-21');
    assert.equal(p.savedCents, 0);
    assert.equal(p.weeksRemaining, null);
    assert.match(p.reason, /Withdrawals/);
  });

  await t.test('a reached target stops projecting', () => {
    const p = project(goal, [contribution(60000, '2026-09-07'), contribution(60000, '2026-09-21')], '2026-09-21');
    assert.equal(p.reached, true);
    assert.equal(p.progress, 1, 'clamped, never over 100%');
    assert.equal(p.remainingCents, 0);
  });

  await t.test('a target date in the past of the projection is flagged', () => {
    const dated = { ...goal, target_date: '2026-10-01' };
    const p = project(dated, [contribution(1000, '2026-09-07'), contribution(1000, '2026-09-21')], '2026-09-21');
    assert.equal(p.behindTarget, true);
  });
});

// ---------------------------------------------------------------------------
test('formatting', async (t) => {
  await t.test('durations read as people say them', () => {
    assert.equal(formatMinutes(0), '0m');
    assert.equal(formatMinutes(45), '45m');
    assert.equal(formatMinutes(60), '1h');
    assert.equal(formatMinutes(500), '8h 20m');
  });

  await t.test('money is euro, two places', () => {
    assert.equal(formatCents(0), '€0.00');
    assert.equal(formatCents(9300), '€93.00');
    assert.equal(formatCents(112505), '€1,125.05');
  });

  await t.test('today is a Dublin day', () => {
    assert.match(dublinDate(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
