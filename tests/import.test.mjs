// Revolut CSV import.
//
// Every case here is one the 2026-09-23 audit found or predicted. The fixture
// in tests/fixtures/revolut-sample.csv is deliberately nasty: two identical
// coffees on one day, a refund, two Canadian rows, a pending row, and a fee.
//
//   npm run test:import

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { parseRevolutCsv, guessCategory, matchRefunds } = await import(
  '../lib/budget/revolut.ts'
);
const { spendingByCategory, totalSpending, excludedByCurrency } = await import(
  '../lib/budget/calc.ts'
);

const here = dirname(fileURLToPath(import.meta.url));
const CSV = readFileSync(join(here, 'fixtures', 'revolut-sample.csv'), 'utf8');
const parsed = parseRevolutCsv(CSV);

const WINDOW = ['2026-09-01', '2026-09-30'];
const withIds = (rows) => rows.map((r, i) => ({ ...r, id: `t${i}`, categorised_by: 'model', source: 'revolut_csv' }));

/* -- The finding that lost data ------------------------------------------ */

test('two identical transactions on one day both survive', () => {
  const coffees = parsed.rows.filter((r) => r.description === 'Grind Coffee');
  assert.equal(coffees.length, 2, 'both coffees parsed');

  // The whole bug: these used to hash identically and the second was dropped
  // by the unique index as a duplicate, silently under-reporting spending.
  assert.notEqual(coffees[0].external_id, coffees[1].external_id);
});

test('re-importing the same file produces the same keys', () => {
  // Idempotency has to survive the ordinal: the same file must map to the
  // same keys every time, or re-import doubles everything.
  const again = parseRevolutCsv(CSV);
  assert.deepEqual(
    again.rows.map((r) => r.external_id),
    parsed.rows.map((r) => r.external_id),
  );
});

test('a key is unique within one file', () => {
  const keys = parsed.rows.map((r) => r.external_id);
  assert.equal(new Set(keys).size, keys.length, 'no two rows share a key');
});

/* -- Currency ------------------------------------------------------------- */

test('non-euro rows are captured, not skipped', () => {
  const cad = parsed.rows.filter((r) => r.currency === 'CAD');
  assert.equal(cad.length, 2, 'both Canadian rows are stored');
  assert.deepEqual(parsed.foreign, { CAD: 2 });

  // Skipping them would have meant going blind in Montreal, which is exactly
  // when the budget matters most. Data not captured is unrecoverable.
  assert.ok(
    !parsed.skipped.some((s) => /euro/i.test(s.reason)),
    'nothing is rejected for being foreign',
  );
});

test('native amounts are stored unconverted', () => {
  const transit = parsed.rows.find((r) => r.description === 'STM Montreal transit');
  assert.equal(transit.amount_cents, -5650, 'the CAD amount, not a conversion');
  assert.equal(transit.currency, 'CAD');
});

test('foreign rows stay out of euro totals', () => {
  const rows = withIds(parsed.rows);
  const spent = totalSpending(rows, ...WINDOW);

  const cadSpend = rows
    .filter((r) => r.currency === 'CAD')
    .reduce((sum, r) => sum + Math.abs(r.amount_cents), 0);
  assert.ok(cadSpend > 0, 'the fixture does contain Canadian spending');

  // CAD 56.50 is not €56.50, and adding it would be quietly wrong.
  const euroOnly = rows.filter((r) => r.currency === 'EUR');
  assert.equal(spent, totalSpending(euroOnly, ...WINDOW));

  assert.deepEqual(excludedByCurrency(rows, ...WINDOW), { CAD: 2 });
});

/* -- Refunds -------------------------------------------------------------- */

test('a refund takes the category of the purchase it reverses', () => {
  const refund = parsed.rows.find((r) => r.amount_cents === 6000);
  assert.ok(refund, 'the Zara refund parsed');

  // It used to be 'income': an €80 purchase refunded €60 reported €80 spent
  // and €60 earned, wrong in both directions with the original never offset.
  assert.notEqual(refund.category, 'income');

  // It takes whatever the purchase was categorised as, so it nets off there.
  // (Zara is not in the importer's hint list, so that happens to be 'other' —
  // the rule is the relationship, not the particular category.)
  const purchase = parsed.rows.find(
    (r) => r.description === refund.description && r.amount_cents < 0,
  );
  assert.equal(refund.category, purchase.category);

  // And the net effect is right: €80 out, €60 back, €20 of real spending.
  const rows = withIds([purchase, refund]);
  assert.equal(totalSpending(rows, ...WINDOW), 8000 - 6000);
});

test('an unmatched refund is excluded from both spending and income', () => {
  const orphan = matchRefunds([
    {
      posted_on: '2026-09-20',
      description: 'Some shop that never charged me',
      amount_cents: 2500,
      currency: 'EUR',
      category: guessCategory('Refund from some shop', 2500),
      external_id: 'x',
    },
  ]);
  assert.equal(orphan[0].category, 'refund');

  const rows = withIds(orphan);
  assert.equal(totalSpending(rows, ...WINDOW), 0, 'not spending');
  assert.equal(
    spendingByCategory(rows, ...WINDOW).length,
    0,
    'and not income either — guessing one would be wrong in a knowable way',
  );
});

test('genuine income is still income', () => {
  const wages = parsed.rows.find((r) => /Payroll/.test(r.description));
  assert.equal(wages.category, 'income');
});

/* -- Things that were already right, kept honest -------------------------- */

test('pending rows are excluded', () => {
  assert.equal(parsed.pending, 1);
  assert.ok(!parsed.rows.some((r) => /Pending/.test(r.description)));
});

test('a fee makes the payment cost more, never less', () => {
  const atm = parsed.rows.find((r) => r.description === 'Cash withdrawal');
  assert.equal(atm.amount_cents, -4050, '40.00 out plus a 0.50 fee');
});

test('transfers to savings are not spending', () => {
  const vault = parsed.rows.find((r) => r.description === 'To savings vault');
  assert.equal(vault.category, 'transfer');
});
