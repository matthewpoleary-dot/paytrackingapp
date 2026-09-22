'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useView } from '@/app/_components/ViewTransition';

/**
 * A step through the range: previous month, next month.
 *
 * Same rule as the range tabs — the navigation runs inside a transition so
 * the current view stays on screen while the next one loads, rather than the
 * page dropping to a skeleton and back for a change of one search param.
 *
 * Both neighbours are prefetched. Stepping is almost always repeated, so the
 * one the user wants next is nearly always one of these two.
 *
 * 44px, because a 32px target is not one.
 */
export function Step({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  const { go } = useView();

  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        go(href, label);
      }}
      className="t-figure flex size-11 items-center justify-center rounded-lg text-fg-secondary transition-[background-color,transform] duration-150 active:scale-90 active:bg-accent-wash"
    >
      {children}
    </Link>
  );
}
