// Drives the app to build a realistic month, then screenshots the v2 screens.
// Uses the real UI throughout — no direct database writes — so the seed also
// exercises roster entry, confirmation and calendar entry.
//
//   node scripts/seed-month.mjs [light|dark]

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

const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 140)}`));

const shot = async (name) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `.shots/v2-${name}-${scheme}.png`, fullPage: true });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`${name.padEnd(16)} ${String(h).padStart(4)}px  ${page.url().replace(BASE, '') || '/'}`);
};

// --- Setup ------------------------------------------------------------------
await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
await page.fill('#rate', '15.50');
await page.getByRole('button', { name: /Start logging shifts/ }).click();
await page.waitForURL(/\/$|\/period/, { timeout: 25000 });

// --- Four weeks of roster ---------------------------------------------------
for (const [week, count] of [
  ['2026-08-31', 3],
  ['2026-09-07', 2],
  ['2026-09-14', 3],
  ['2026-09-21', 2],
]) {
  await page.goto(`${BASE}/roster?start=${week}`, { waitUntil: 'networkidle' });
  for (let i = 0; i < count; i++) await page.getByLabel('One more shift').click();
  await page.getByRole('button', { name: new RegExp(`Log ${count} shifts`) }).click();
  await page.waitForURL(/\/period/, { timeout: 25000 });
}

// --- Confirm the ones already worked, with varied finishes so the calendar
//     has a real range to shade rather than one flat colour. -----------------
await page.goto(`${BASE}/confirm`, { waitUntil: 'networkidle' });
const ends = ['23:30', '00:45', '01:20', '23:30', '02:10', '23:30', '00:15', '01:05'];
const times = await page.locator('input[type="time"]').all();
for (let i = 0; i < times.length; i++) await times[i].fill(ends[i % ends.length]);
// Leave the last two unconfirmed on purpose — the dashed-ring state needs to
// be visible in the grid, and a fully confirmed month would not show it.
await page.getByRole('button', { name: /Confirm these shifts/ }).click();
await page.waitForURL(/\/period/, { timeout: 25000 });

// --- One shift added straight from the calendar -----------------------------
await page.goto(`${BASE}/day/2026-09-09`, { waitUntil: 'networkidle' });
await shot('day-empty');
await page.locator('input[name="start"]').fill('12:00');
await page.locator('input[name="end"]').fill('17:00');
await page.getByRole('button', { name: /^Add shift$/ }).click();
// The redirect target equals the current URL, so waitForURL resolves at once
// and screenshots the mid-save state. Wait for the shift itself to appear.
await page.getByText(/^Shift 1$/).waitFor({ timeout: 25000 });
await shot('day-filled');

// --- Savings goal -----------------------------------------------------------
await page.goto(`${BASE}/goal`, { waitUntil: 'networkidle' });
await shot('goal-empty');
// Skipped entirely until migration 2 is applied — the goal tables do not
// exist yet, and the form reports that rather than throwing.
try {
  await page.fill('input[name="name"]', 'Deposit');
  await page.fill('input[name="target"]', '2500');
  await page.getByRole('button', { name: /Set goal/ }).click();
  await page.getByText(/Record what you set aside/).waitFor({ timeout: 8000 });

  for (const [amount, date] of [['120', '2026-09-05'], ['90', '2026-09-12'], ['150', '2026-09-19']]) {
    await page.fill('input[name="amount"]', amount);
    await page.fill('input[name="date"]', date);
    await page.getByRole('button', { name: /Add contribution/ }).click();
    await page.waitForTimeout(900);
  }
  await page.goto(`${BASE}/goal`, { waitUntil: 'networkidle' });
  await shot('goal');
} catch {
  console.log('goal            SKIPPED — migration 2 not applied');
  await shot('goal-error');
}

// --- The dashboard ----------------------------------------------------------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await shot('dashboard');

await browser.close();
if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log(`  ${p}`);
  process.exitCode = 1;
}
