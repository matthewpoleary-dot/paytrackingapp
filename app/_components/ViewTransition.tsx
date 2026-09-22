'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from 'react';

/**
 * Never blank a screen you already have content for.
 *
 * Switching Week/Month/Year is a server round trip through searchParams, so
 * the route suspended and the whole screen dropped to a skeleton and back.
 * That reads as a page load, not as moving between views you already have —
 * and the flash of an empty calendar is the single thing that made this feel
 * unfinished.
 *
 * `startTransition` keeps the previous render on screen while the next one
 * resolves. The old content stays, dimmed, and is replaced in one step when
 * it is ready. Nothing is ever removed to show a placeholder.
 *
 * The pill is separate and optimistic: it moves on the tap, in the same
 * frame, because a control that waits for the network to tell it what it
 * already knows feels broken however fast the network is.
 */

interface ViewState {
  pending: boolean;
  /** What the user last tapped, believed immediately. */
  optimistic: string | null;
  go: (href: string, key: string) => void;
}

const Ctx = createContext<ViewState>({ pending: false, optimistic: null, go: () => {} });

export const useView = () => useContext(Ctx);

export function ViewTransition({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<string | null>(null);

  const go = useCallback(
    (href: string, key: string) => {
      setOptimistic(key);
      startTransition(() => {
        router.push(href, { scroll: false });
      });
    },
    [router],
  );

  return <Ctx.Provider value={{ pending, optimistic, go }}>{children}</Ctx.Provider>;
}

/**
 * Holds its children on screen while the next view loads.
 *
 * Opacity only, so it stays on the compositor and triggers no layout. The
 * global reduced-motion rule flattens the fade to nothing, which is correct:
 * the point is that the content never leaves, and that is still true without
 * the transition.
 *
 * `aria-busy` rather than a visual-only cue, so the wait is announced to a
 * screen reader that cannot see the dimming.
 */
export function Pending({ children }: { children: ReactNode }) {
  const { pending } = useView();
  return (
    <div
      aria-busy={pending || undefined}
      className={`transition-opacity duration-200 ease-out ${pending ? 'opacity-45' : 'opacity-100'}`}
    >
      {children}
    </div>
  );
}
