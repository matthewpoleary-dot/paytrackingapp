'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Timings for the cold open.
 *
 * The motion itself is declared in globals.css (.boot-lockup, .boot-letter)
 * so the compositor owns it; these are the same numbers, kept here because
 * they decide how long the screen is held. If you change one, change both.
 *
 * This is the one place in the app that deliberately costs time, so the
 * sequence is spelled out rather than buried: the mark holds alone, the word
 * opens out of it, the lockup rests, the screen fades.
 */
const HOLD_MS = 620;
const SPREAD_MS = 620;
const LETTER_STAGGER_MS = 70;
const REST_MS = 820;
const FADE_MS = 420;
const MINIMUM_MS = HOLD_MS + SPREAD_MS + LETTER_STAGGER_MS * 3 + REST_MS;

/** Reduced motion gets a shorter wait: there is no animation to sit through. */
const STILL_MS = 900;

const REST_OF_WORD = ['a', 'l', 'l', 'y'];

const pad = (n: number) => String(n).padStart(2, '0');

function timecodeAt(frames: number): string {
  return [
    pad(Math.floor(frames / 108000)),
    pad(Math.floor(frames / 1800) % 60),
    pad(Math.floor(frames / 30) % 60),
    pad(frames % 30),
  ].join(':');
}

/**
 * The cold-open screen.
 *
 * A full-bleed field, a quiet mark, and one small monospaced timecode
 * anchored to the bottom. No spinner, no progress bar. The single piece of
 * motion earns its place by saying what the app is called: the mark sits
 * alone, then the rest of the word opens out of it.
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
  const timecodeRef = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState<number | null>(null);
  const [leaving, setLeaving] = useState(false);

  // Measured before paint, then handed to CSS as a variable. Laying the
  // lockup out whole and pushing it right by half the width of the still
  // invisible word is what makes the mark read as centred — and animating
  // that offset away is what makes the word appear to come OUT of the mark
  // rather than arrive beside it.
  useLayoutEffect(() => {
    if (wordRef.current) setShift(wordRef.current.offsetWidth / 2);
  }, []);

  // Dismiss on the later of the sequence finishing and the page being ready,
  // so a slow load is never cut short and a fast one still gets its moment.
  useEffect(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimum = new Promise<void>((r) => setTimeout(r, still ? STILL_MS : MINIMUM_MS));
    const ready =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((r) => window.addEventListener('load', () => r(), { once: true }));

    let cancelled = false;
    void Promise.all([minimum, ready]).then(() => {
      if (cancelled) return;
      setLeaving(true);
      setTimeout(
        () => {
          try {
            sessionStorage.setItem('tally.booted', '1');
          } catch {
            // Private mode: the screen shows again next time. Harmless.
          }
          document.documentElement.setAttribute('data-booted', '');
        },
        still ? 0 : FADE_MS,
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The counter writes straight to the DOM. Held in React state it re-rendered
  // this tree on every animation frame, which collided with hydration.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let start: number | null = null;
    let shown = -1;
    const tick = (now: number) => {
      start ??= now;
      const frames = Math.floor(((now - start) / 1000) * 30);
      if (frames !== shown && timecodeRef.current) {
        timecodeRef.current.textContent = timecodeAt(frames);
        shown = frames;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="boot fixed inset-0 z-50 flex flex-col items-center justify-center bg-surface"
      style={{
        opacity: leaving ? 0 : 1,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.32, 0.72, 0, 1)`,
      }}
    >
      <div
        className={shift === null ? 'flex items-center' : 'boot-lockup flex items-center'}
        style={
          {
            // Hidden until measured, so the lockup never flashes off-centre.
            visibility: shift === null ? 'hidden' : 'visible',
            '--boot-shift': `${shift ?? 0}px`,
          } as React.CSSProperties
        }
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
              className={shift === null ? undefined : 'boot-letter'}
              style={{ '--i': i } as React.CSSProperties}
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
          TALLY&nbsp;&nbsp;<span ref={timecodeRef}>{timecodeAt(0)}</span>
        </p>
      </div>

      <span className="sr-only" role="status">
        Loading Tally
      </span>
    </div>
  );
}
