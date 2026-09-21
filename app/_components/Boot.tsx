'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Timings for the cold open.
 *
 * This is the one place in the app that deliberately costs time, so the
 * numbers live together at the top where they can be judged as a sequence
 * rather than found scattered through the file.
 *
 * The mark holds alone first, then the word spreads out of it, then the whole
 * lockup rests before the screen leaves. `MINIMUM_MS` is the floor; a slower
 * load extends it rather than cutting the animation short.
 */
const HOLD_MS = 620; // the T alone, before anything moves
const SPREAD_MS = 620; // the word opening out
const LETTER_STAGGER_MS = 70;
const REST_MS = 820; // settled, before the exit
const FADE_MS = 420;
const MINIMUM_MS = HOLD_MS + SPREAD_MS + LETTER_STAGGER_MS * 3 + REST_MS;

// Critically damped: reaches the target and stops. Apple's default for
// anything the user did not throw — overshoot on an intro that nobody
// gestured at reads as fidgeting.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

const REST_OF_WORD = ['a', 'l', 'l', 'y'];

/**
 * The cold-open screen.
 *
 * Modelled on presterly.com: a full-bleed field, a quiet mark, and one small
 * monospaced timecode anchored to the bottom. No spinner, no progress bar.
 *
 * The one piece of motion earns its place by saying what the app is called:
 * the mark sits alone, then the rest of the word opens out of it. Only
 * transform and opacity animate, so it stays on the compositor.
 *
 * The timecode counts ELAPSED time, which is the only honest thing it could
 * count. A bar filling to a made-up percentage would be the same lie this app
 * spends the rest of its surface refusing to tell.
 *
 * Lives in the root layout, not loading.tsx: inside the Suspense fallback it
 * was torn down the instant data arrived, so it could never be held.
 */
export function Boot() {
  const wordRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState<number | null>(null);
  const [spread, setSpread] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [frames, setFrames] = useState(0);
  const started = useRef<number | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // Measure the unrevealed word, then push the lockup right by half of it so
  // the mark alone reads as centred. Animating back to zero is what makes the
  // word appear to open out of the mark rather than beside it.
  useLayoutEffect(() => {
    if (wordRef.current) setOffset(wordRef.current.offsetWidth / 2);
  }, []);

  useEffect(() => {
    if (offset === null) return;
    const t = setTimeout(() => setSpread(true), still ? 0 : HOLD_MS);
    return () => clearTimeout(t);
  }, [offset, still]);

  // Dismiss on the later of the sequence finishing and the page being ready,
  // so a slow load is never cut short and a fast one still gets its moment.
  useEffect(() => {
    const minimum = new Promise<void>((r) => setTimeout(r, still ? 900 : MINIMUM_MS));
    const ready =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true }));

    let cancelled = false;
    void Promise.all([minimum, ready]).then(() => {
      if (cancelled) return;
      setLeaving(true);
      setTimeout(() => {
        try {
          sessionStorage.setItem('tally.booted', '1');
        } catch {
          // Private mode: the screen shows again next time. Harmless.
        }
        document.documentElement.setAttribute('data-booted', '');
      }, still ? 0 : FADE_MS);
    });
    return () => {
      cancelled = true;
    };
  }, [still]);

  useEffect(() => {
    if (still) return;
    let raf = 0;
    const tick = (now: number) => {
      started.current ??= now;
      setFrames(Math.floor(((now - started.current) / 1000) * 30));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still]);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timecode = [
    pad(Math.floor(frames / 108000)),
    pad(Math.floor(frames / 1800) % 60),
    pad(Math.floor(frames / 30) % 60),
    pad(frames % 30),
  ].join(':');

  return (
    <div
      className="boot fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface"
      style={{
        opacity: leaving && !still ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ${EASE}`,
      }}
    >
      <div
        className="flex items-center"
        style={{
          // Hidden until measured, so the lockup never flashes off-centre.
          visibility: offset === null ? 'hidden' : 'visible',
          transform: `translateX(${spread ? 0 : (offset ?? 0)}px)`,
          transition: still ? undefined : `transform ${SPREAD_MS}ms ${EASE}`,
        }}
      >
        <svg viewBox="0 0 64 64" width="48" height="48" aria-hidden="true" className="shrink-0">
          <rect width="64" height="64" rx="15" className="fill-accent" />
          <g className="fill-accent-fg">
            <rect x="12" y="18" width="40" height="8" rx="4" />
            <rect x="28" y="18" width="8" height="30" rx="4" />
          </g>
        </svg>

        <span ref={wordRef} className="t-display flex pl-3" aria-hidden="true">
          {REST_OF_WORD.map((letter, i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: spread ? 1 : 0,
                transform: spread ? 'translateX(0)' : 'translateX(-0.5em)',
                transition: still
                  ? undefined
                  : `opacity ${SPREAD_MS}ms ${EASE} ${i * LETTER_STAGGER_MS}ms, transform ${SPREAD_MS}ms ${EASE} ${i * LETTER_STAGGER_MS}ms`,
              }}
            >
              {letter}
            </span>
          ))}
        </span>
      </div>

      {/* Clear of the home indicator. Note that Tailwind scans comments too,
          so writing an arbitrary-value class in prose here generates it for
          real — an elided one breaks the stylesheet. */}
      <div className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] flex justify-center">
        <p className="t-label text-fg-tertiary tabular-nums" style={{ letterSpacing: '0.18em' }}>
          TALLY&nbsp;&nbsp;{timecode}
        </p>
      </div>

      <span className="sr-only" role="status">
        Loading Tally
      </span>
    </div>
  );
}
