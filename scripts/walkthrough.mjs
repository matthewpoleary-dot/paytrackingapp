// Drives the whole app against a running dev server and screenshots each
// screen at 390x844. Exercises the real wiring — anonymous session, server
// actions, RLS-scoped reads — rather than rendering components in isolation.
//
//   node scripts/walkthrough.mjs [light|dark]

import { chromium } from 'playwright';

const scheme = process.argv[2] ?? 'light';
const BASE = process.env.BASE ?? 'http://localhost:3000';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: scheme,
  locale: 'en-IE',
  timezoneId: 'Europe/Dublin',
});
const page = await context.newPage();

const failures = [];
page.on('console', (m) => {
  if (m.type() === 'error') failures.push(`console: ${m.text().slice(0, 140)}`);
});
page.on('pageerror', (e) => failures.push(`pageerror: ${e.message.slice(0, 140)}`));

const shot = async (name) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: `.shots/w-${name}-${scheme}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${name.padEnd(18)} ${String(h).padStart(4)}px  ${page.url().replace(BASE, '') || '/'}`);
};

const assert = (condition, message) => {
  if (!condition) failures.push(`ASSERT: ${message}`);
};

// --- First run --------------------------------------------------------------
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
await page.fill('#rate', '15.50');
await shot('1-setup');
await page.getByRole('button', { name: /Start logging shifts/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 25000 });
await shot('2-empty');

// --- The bug that started this: log NEXT week from the primary button and
//     make sure the shifts are actually visible afterwards. -----------------
await page.getByRole('link', { name: /Add next week/ }).click();
await page.waitForURL(/\/roster/, { timeout: 25000 });
for (let i = 0; i < 2; i++) await page.getByLabel('One more shift').click();
await shot('3-roster-next');
await page.getByRole('button', { name: /Log 2 shifts/ }).click();
await page.waitForURL(/\/\?period=/, { timeout: 25000 });
assert(
  (await page.locator('text=Nothing logged for this period').count()) === 0,
  'shifts logged for next week are not visible after saving',
);
assert((await page.locator('text=2 shifts').count()) > 0, 'shift count missing');
await shot('4-next-period');

// --- Back to the current period, and log shifts already worked -------------
await page.getByRole('link', { name: /Back to this period/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 25000 });
await page.getByRole('link', { name: /Add a shift to this week/ }).click();
await page.waitForURL(/\/roster/, { timeout: 25000 });
for (let i = 0; i < 3; i++) await page.getByLabel('One more shift').click();
await page.getByRole('button', { name: /Log 3 shifts/ }).click();
await page.waitForURL(/\/\?period=/, { timeout: 25000 });
await shot('5-estimated');

// --- Confirmation -----------------------------------------------------------
await page.goto(`${BASE}/confirm`, { waitUntil: 'networkidle' });
const times = await page.locator('input[type="time"]').all();
if (times.length) await times[0].fill('01:20');
const none = await page.getByText('None', { exact: true }).all();
if (none.length) await none[0].click();
await shot('6-confirm');
await page.getByRole('button', { name: /Confirm these shifts/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 25000 });
assert(
  (await page.locator('text=to confirm').count()) === 0,
  'confirm prompt still showing after confirming everything',
);
await shot('7-confirmed');

// --- Pay rise ---------------------------------------------------------------
const before = await page.locator('main header a').last().innerText();
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
await page.fill('#rate', '16.80');
await shot('8-settings');
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForURL(`${BASE}/`, { timeout: 25000 });
const after = await page.locator('main header a').last().innerText();
assert(before !== after && after.includes('16.80'), `rate did not update: ${before} -> ${after}`);
assert(
  (await page.locator('text=€129.17').count()) > 0,
  'a pay rise re-priced an already-logged shift',
);
await shot('9-after-rise');

await browser.close();

if (failures.length) {
  console.log('\nFAILURES');
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
} else {
  console.log('\nall assertions passed');
}
