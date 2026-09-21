'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * How long the cold-open screen stays up, at minimum.
 *
 * This is the one place in the app that deliberately costs time, so it is
 * worth being honest about. Tied strictly to real loading it was invisible:
 * production serves the dashboard with a 21ms TTFB, so it painted for about
 * a frame and vanished. A front door nobody sees is not a front door.
 *
 * 1100ms is long enough to read the mark and watch the timecode move, short
 * enough not to grate on an app opened daily. It is paid once per session,
 * on cold open only — never on an in-app navigation.
 */
const MINIMUM_MS = 1100;

/**
 * The cold-open screen.
 *
 * Modelled on presterly.com: a full-bleed field, nothing in the middle but a
 * quiet mark, and one small monospaced counter anchored to the bottom. No
 * spinner, no progress bar, no logo animation — the restraint is the point.
 *
 * The counter is a timecode: hours, minutes, seconds, frames at 30fps. It
 * counts ELAPSED time, which is the only honest thing it could count. A bar
 * filling to a made-up percentage, or a money figure ticking up to a number
 * nobody has computed yet, would be the same lie this app spends the rest of
 * its surface refusing to tell.
 *
 * It lives in the root layout rather than in loading.tsx. Inside the Suspense
 * fallback it was torn down the instant the data arrived, which is precisely
 * why it could never be held on screen.
 */
export function Boot() {
  const [frames, setFrames] = useState(0);
  const start = useRef<number | null>(null);

  // Dismiss on the later of: the minimum elapsing, and the page being ready.
  // Whichever is slower wins, so a slow load is never cut short and a fast
  // one still gets its moment.
  useEffect(() => {
    const minimum = new Promise<void>((resolve) => setTimeout(resolve, MINIMUM_MS));
    const ready =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((resolve) =>
            window.addEventListener('load', () => resolve(), { once: true }),
          );

    let cancelled = false;
    void Promise.all([minimum, ready]).then(() => {
      if (cancelled) return;
      try {
        sessionStorage.setItem('tally.booted', '1');
      } catch {
        // Private mode or blocked storage: the screen simply shows again next
        // time. Harmless.
      }
      document.documentElement.setAttribute('data-booted', '');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // A ticking counter is motion. Under reduced motion it holds at zero
    // rather than flickering digits at someone who asked for stillness.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    const tick = (now: number) => {
      start.current ??= now;
      setFrames(Math.floor(((now - start.current) / 1000) * 30));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timecode = [
    pad(Math.floor(frames / 108000)),
    pad(Math.floor(frames / 1800) % 60),
    pad(Math.floor(frames / 30) % 60),
    pad(frames % 30),
  ].join(':');

  return (
    <div className="boot fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface">
      <svg viewBox="0 0 64 64" width="44" height="44" aria-hidden="true">
        <rect width="64" height="64" rx="15" className="fill-accent" />
        <g className="fill-accent-fg">
          <rect x="12" y="18" width="40" height="8" rx="4" />
          <rect x="28" y="18" width="8" height="30" rx="4" />
        </g>
      </svg>

      {/* Clear of the home indicator. Note that Tailwind scans comments too,
          so writing an arbitrary-value class in prose here generates it for
          real — an elided one breaks the stylesheet. */}
      <div className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] flex justify-center">
        <p
          className="t-label text-fg-tertiary tabular-nums"
          style={{ letterSpacing: '0.18em' }}
        >
          TALLY&nbsp;&nbsp;{timecode}
        </p>
      </div>

      <span className="sr-only" role="status">
        Loading Tally
      </span>
    </div>
  );
}
