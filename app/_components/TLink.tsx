'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { useView } from '@/app/_components/ViewTransition';

/**
 * A link that does not blank the screen.
 *
 * Every route here is dynamic — each one reaches Supabase — so Next neither
 * prefetches them by default nor has anything to show while one renders.
 * Measured on a production build at 4x CPU, a plain <Link> to any of them
 * cost 276–341ms of empty screen; prefetching brought that to 164–219ms, and
 * the rest is the server actually doing the work.
 *
 * That last part cannot be made faster, so it is made invisible instead. The
 * push runs inside a transition, React keeps the current screen mounted until
 * the next one is ready, and `main` dims while it waits. Perceived delay is
 * the dim, not a blank page.
 *
 * `prefetch` is on by default here because every link that uses this is one
 * the user can see.
 */
export function TLink({
  href,
  children,
  prefetch = true,
  onNavigate,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
  href: string;
  children: ReactNode;
  prefetch?: boolean;
  onNavigate?: () => void;
}) {
  const { go } = useView();

  return (
    <Link
      {...rest}
      href={href}
      prefetch={prefetch}
      onClick={(event) => {
        rest.onClick?.(event);
        if (event.defaultPrevented) return;
        // Modified clicks still have to open a new tab.
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate?.();
        go(href, href);
      }}
    >
      {children}
    </Link>
  );
}
