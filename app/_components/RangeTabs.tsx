'use client';

import Link from 'next/link';
import { RANGE_KINDS, type RangeKind } from '@/lib/pay/range';
import { useView } from '@/app/_components/ViewTransition';

const LABEL: Record<RangeKind, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

/**
 * Week / Month / Year.
 *
 * Still links, and still real URLs: each view survives a refresh, can be
 * shared, and the back button steps through what you looked at. A
 * client-only toggle would have been less code and worse.
 *
 * What changed is what happens on the tap. The href used to be followed
 * directly, which suspended the route and dropped the whole screen to a
 * skeleton — so switching views read as a page load. Now the navigation runs
 * inside a transition that keeps the current view on screen until the next
 * one is ready, and the pill moves optimistically in the same frame as the
 * tap rather than after a round trip.
 *
 * All three are prefetched. There are exactly three and the user is going to
 * tap one of them; waiting to find out which is a round trip spent on
 * nothing.
 */
export function RangeTabs({ active, at }: { active: RangeKind; at: string }) {
  const { optimistic, go } = useView();

  // Believe the tap until the server disagrees. Once the new page renders it
  // arrives as `active` and the two agree again.
  const shown = (optimistic as RangeKind | null) ?? active;

  return (
    <nav aria-label="Time range" className="flex gap-1 rounded-xl bg-segment-track p-1">
      {RANGE_KINDS.map((kind) => {
        const selected = kind === shown;
        const href = `/?range=${kind}&at=${at}`;
        return (
          <Link
            key={kind}
            href={href}
            prefetch
            aria-current={selected ? 'page' : undefined}
            onClick={(event) => {
              // Let the browser handle modified clicks — open in a new tab
              // still has to work.
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              go(href, kind);
            }}
            className={[
              'flex min-h-11 flex-1 items-center justify-center rounded-[0.625rem]',
              // Colour only. The pill is a background change, so nothing here
              // triggers layout.
              'transition-[background-color,color] duration-150',
              selected
                ? 'bg-segment-pill font-medium text-fg'
                : 'text-fg-secondary active:bg-accent-wash',
            ].join(' ')}
          >
            <span className="t-caption">{LABEL[kind]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
