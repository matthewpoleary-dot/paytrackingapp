'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * Scrolls the date strip so today sits in the middle of it.
 *
 * A month strip opens on the 1st otherwise, which for anyone past the first
 * week means the days they came to look at are off-screen — including every
 * shift they have worked.
 *
 * `scrollLeft` is set directly rather than through `scrollIntoView`, which
 * can move the page's own scroll position as well as the strip's. In a layout
 * effect, so it lands before the browser paints and the strip is simply in
 * the right place rather than visibly jumping to it.
 *
 * Browsing a past or future range has no today to find, and the strip stays
 * at its start, which is the right answer there.
 */
export function StripScroll({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    const today = box?.querySelector<HTMLElement>('[data-today]');
    if (!box || !today) return;
    box.scrollLeft = today.offsetLeft - box.clientWidth / 2 + today.clientWidth / 2;
  }, []);

  return (
    <div ref={ref} className={className} style={style}>
      {children}
    </div>
  );
}
