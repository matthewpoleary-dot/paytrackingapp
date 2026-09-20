// Money is integer cents everywhere. Durations are integer minutes. No float
// ever holds a monetary value, and nothing here returns one.

/**
 * The project's one rounding rule. Decided 2026-09-20: round to the cent per
 * shift, half up. See CLAUDE.md § Money.
 *
 * It lives here alone so that no call site can quietly pick a different one —
 * a period total that disagrees with the days above it by a cent destroys the
 * app's credibility as a record.
 */
export function roundToCents(exactCents: number): number {
  return Math.floor(exactCents + 0.5);
}

/**
 * What a stretch of paid time is worth.
 *
 * Rounded here, at the shift, and never re-derived at the period level — a
 * period total is the SUM of these, so the rows always add up to the total.
 */
export function payForMinutes(paidMinutes: number, rateCents: number): number {
  return roundToCents((paidMinutes * rateCents) / 60);
}

/** Sum of already-rounded parts. Deliberately not a rounding boundary. */
export function sumCents(parts: readonly number[]): number {
  return parts.reduce((total, part) => total + part, 0);
}

const EUR = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
});

const EUR_WHOLE = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

/** For the hero figure, where cents are noise at a glance. */
export function formatCentsWhole(cents: number): string {
  return EUR_WHOLE.format(cents / 100);
}

/**
 * Parses what someone types into a rate field: "13.85", "13,85", "€13.85",
 * "13". Returns null for anything it cannot read, rather than guessing —
 * a silently misread pay rate is wrong on every screen in the app.
 */
export function parseRateToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[€\s]/g, '').replace(',', '.');
  if (!/^\d{1,4}(\.\d{0,2})?$/.test(cleaned)) return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;

  return roundToCents(value * 100);
}

/** Minutes between two instants. Correct across DST because these are instants. */
export function minutesBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 60_000);
}
