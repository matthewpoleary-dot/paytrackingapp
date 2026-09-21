// Behavioural tests for the dashboard: ranges, the calendar, bulk entry into
// any week, and the invariants that tie the numbers together.
//
// Everything here goes through the real UI against a real database, because
// the failures worth catching are wiring failures — a view that saves data it
// then cannot show, a total that disagrees with the rows under it.
//
//   node scripts/ux.mjs [light|dark]

import { chromium } from 'playwright';

const scheme = process.argv[2] ?? 'light';
const BASE = process.env.BASE ?? 'http://localhost:3000';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: scheme,
  locale: 'en-IE',
  timezoneId: 'Europe/Dublin',
});
const page = await context.newPage();

const failures = [];
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message.slice(0, 140)}`));
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(`console: ${m.text().slice(0, 140)}`);
});

const check = (ok, message) => {
  if (!ok) failures.push(`ASSERT: ${message}`);
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${message}`);
};

/** A navigation resolving is not the content arriving. */
const settle = () =>
  page
    .waitForFunction(
      () => {
        const boot = document.querySelector('.boot');
        const bootShowing = boot !== null && getComputedStyle(boot).display !== 'none';
        return !document.querySelector('.skeleton') && !bootShowing;
      },
      null,
      { timeout: 25000 },
    )
    .catch(() => {});

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await settle();
};

const centsOnPage = async (selector) =>
  (await page.locator(selector).allInnerTexts()).map((t) =>
    Math.round(Number(t.replace(/[^0-9.]/g, '')) * 100),
  );

// --- Setup ------------------------------------------------------------------
await go('/setup');
await page.fill('#rate', '15.50');
await page.getByRole('button', { name: /Start logging shifts/ }).click();
await page.waitForURL(new RegExp(String.raw`/$|/period`), { timeout: 25000 });

// --- Bulk entry into ANY week, including the past --------------------------
const WEEKS = [
  ['2026-08-31', 3],
  ['2026-09-07', 2],
  ['2026-09-14', 3],
  ['2026-09-21', 2],
];
for (const [week, n] of WEEKS) {
  await go(`/roster?start=${week}`);
  for (let i = 0; i < n; i++) await page.getByLabel('One more shift').click();
  await page.getByRole('button', { name: new RegExp(`Log ${n} shifts`) }).click();
  await page.waitForURL(new RegExp(String.raw`/\?range=week`), { timeout: 25000 });
  await settle();
  check(
    (await page.locator('text=No shifts in this range').count()) === 0,
    `shifts logged to ${week} are visible after saving`,
  );
}

// The week stepper must actually move, not just relabel.
await go('/roster?start=2026-09-14');
const before = await page.locator('main p.t-heading').first().innerText();
await page.getByLabel('Next week').click();
await page.waitForURL(/start=2026-09-21/, { timeout: 25000 });
await settle();
const after = await page.locator('main p.t-heading').first().innerText();
check(before !== after, `week stepper moves the target week (${before} -> ${after})`);

// --- Ranges -----------------------------------------------------------------
for (const range of ['week', 'month', 'year']) {
  await go(`/?range=${range}&at=2026-09-21`);
  check(
    (await page.locator(`nav[aria-label="Time range"] a[aria-current="page"]`).innerText())
      .toLowerCase()
      .startsWith(range),
    `${range} tab is marked current`,
  );
  check(
    !(await page.locator('.boot').isVisible().catch(() => false)),
    `${range}: no cold-open takeover on navigation`,
  );
}

// Range totals must nest: a week cannot exceed its month, nor a month its year.
const totalFor = async (range) => {
  await go(`/?range=${range}&at=2026-09-21`);
  const hero = await page.locator('section.bg-surface-inverse span[aria-label]').first().getAttribute('aria-label');
  return Math.round(Number((hero ?? '').replace(/[^0-9.]/g, '')) * 100);
};
const weekTotal = await totalFor('week');
const monthTotal = await totalFor('month');
const yearTotal = await totalFor('year');
check(weekTotal <= monthTotal, `week (${weekTotal}) fits inside month (${monthTotal})`);
check(monthTotal <= yearTotal, `month (${monthTotal}) fits inside year (${yearTotal})`);

// --- Stepping ---------------------------------------------------------------
for (const range of ['week', 'month', 'year']) {
  await go(`/?range=${range}&at=2026-09-21`);
  const labelOf = () => page.locator('main header + nav + div p.t-label').first().innerText();
  const startLabel = await labelOf();

  const clickAndLand = async (label) => {
    const from = page.url();
    await page.getByLabel(label).click();
    await page.waitForURL((u) => u.toString() !== from, { timeout: 25000 });
    await settle();
  };

  await clickAndLand(`Next ${range}`);
  const steppedLabel = await labelOf();
  await clickAndLand(`Previous ${range}`);
  check(steppedLabel !== startLabel, `${range}: next moves (${startLabel} -> ${steppedLabel})`);
  check(
    (await labelOf()) === startLabel,
    `${range}: next then previous returns to the same span`,
  );
}

// --- The calendar -----------------------------------------------------------
await go('/?range=month&at=2026-09-21');
const dayTotals = await page.evaluate(() =>
  [...document.querySelectorAll('a[href^="/day/"]')]
    .map((a) => a.getAttribute('aria-label') ?? '')
    .filter((l) => !l.includes('no shifts'))
    .map((l) => {
      const m = l.match(/€([\d,]+\.\d{2})/);
      return m ? Math.round(Number(m[1].replace(/,/g, '')) * 100) : 0;
    }),
);
check(dayTotals.length > 0, 'month calendar marks worked days');
check(
  dayTotals.reduce((a, b) => a + b, 0) === monthTotal,
  `day cells sum to the month headline (${dayTotals.reduce((a, b) => a + b, 0)} vs ${monthTotal})`,
);

const estimatedRings = await page.locator('a[href^="/day/"].border-dashed').count();
check(estimatedRings > 0, 'estimated days carry a dashed ring');

await page.locator('a[href^="/day/"]').nth(10).click();
await page.waitForURL(/\/day\//, { timeout: 25000 });
await settle();
check(page.url().includes('/day/2026-09'), 'tapping a day opens that day');

// --- Year view ---------------------------------------------------------------
await go('/?range=year&at=2026-09-21');
const monthLinks = await page
  .locator('section a[href*="range=month&at="]')
  .count();
check(monthLinks === 12, `year view shows 12 month grids (found ${monthLinks})`);
await page.locator('a[href*="range=month&at=2026-09-01"]').first().click();
await page.waitForURL(/range=month/, { timeout: 25000 });
await settle();
check(page.url().includes('at=2026-09-01'), 'tapping a month in the year view opens it');

// --- Confirmation still clears ----------------------------------------------
await go('/confirm');
if ((await page.getByRole('button', { name: /Confirm these shifts/ }).count()) > 0) {
  await page.getByRole('button', { name: /Confirm these shifts/ }).click();
  await page.waitForURL(new RegExp(String.raw`/$`), { timeout: 25000 });
  await settle();
  check(
    (await page.locator('text=to confirm').count()) === 0,
    'confirm prompt clears once everything is confirmed',
  );
}

// --- A pay rise must not reach backwards ------------------------------------
await go('/?range=month&at=2026-09-21');
const beforeRise = await centsOnPage('a[href^="/day/"] >> nth=0');
const monthBeforeRise = await totalFor('month');
await go('/settings');
await page.fill('#rate', '19.00');
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForURL(new RegExp(String.raw`/$`), { timeout: 25000 });
const monthAfterRise = await totalFor('month');
check(
  monthBeforeRise === monthAfterRise,
  `a pay rise leaves logged shifts alone (${monthBeforeRise} vs ${monthAfterRise})`,
);
void beforeRise;

await browser.close();

console.log('');
if (failures.length) {
  console.log(`${failures.length} FAILURES`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log('all UX assertions passed');
}
