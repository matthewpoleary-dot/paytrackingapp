'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * The cold-open screen.
 *
 * Modelled on presterly.com: a full-bleed field, nothing in the middle but a
 * quiet mark, and one small monospaced counter anchored to the bottom. No
 * spinner, no progress bar, no logo animation — the restraint is the point.
 *
 * The counter is a timecode: hours, minutes, seconds, frames at 30fps. It
 * counts ELAPSED time, which is the only honest thing it could count. This
 * app refuses to show an estimate as a fact; a bar filling to a made-up
 * percentage, or a money figure ticking up to a number nobody has computed
 * yet, would be the same lie in a nicer coat.
 *
 * It never delays anything. It lives in loading.tsx, so it is on screen for
 * exactly as long as the data actually takes and not a frame longer.
 */
export function Boot() {
  const [frames, setFrames] = useState(0);
  const start = useRef<number | null>(null);

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

/**
 * Marks the session as booted once the app has actually rendered.
 *
 * Without this the cold-open screen would reappear on every in-app
 * navigation, where a full-bleed takeover is exactly the wrong thing — a
 * skeleton that holds the layout is better there.
 *
 * Mounted by the PAGE, never the layout. In the layout it ran during
 * loading.tsx as well, setting the flag while the cold-open screen was still
 * on screen and hiding it mid-load — which left a blank field.
 */
export function BootFlag() {
  useEffect(() => {
    try {
      sessionStorage.setItem('tally.booted', '1');
    } catch {
      // Private mode or blocked storage: the cold-open screen simply shows
      // again next time. Harmless.
    }
    document.documentElement.setAttribute('data-booted', '');
  }, []);

  return null;
}
