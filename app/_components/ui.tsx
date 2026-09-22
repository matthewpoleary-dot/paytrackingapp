import Link from 'next/link';
import { TLink } from '@/app/_components/TLink';
import type { ReactNode } from 'react';
import { formatCents } from '@/lib/pay/money';

/** The page shell. One column, phone-first, clear of the notch and the bar. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pt-[max(1.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {children}
    </main>
  );
}

export function PageHeader({
  eyebrow,
  title,
  back,
}: {
  eyebrow?: string;
  title: string;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-6">
      {back && (
        <TLink
          href={back.href}
          className="t-caption mb-3 -ml-2 inline-flex min-h-11 items-center gap-1 px-2 text-fg-secondary"
        >
          <Chevron direction="left" className="t-body" /> {back.label}
        </TLink>
      )}
      {eyebrow && <p className="t-label text-fg-secondary">{eyebrow}</p>}
      <h1 className="t-title mt-1.5 text-balance">{title}</h1>
    </header>
  );
}

/**
 * The one arrow in the app.
 *
 * Drawn rather than typed. `&rarr;` and `&lsaquo;` are different faces at
 * different weights that happen to live in the same font, which is why the
 * dashboard ended up with two arrow vocabularies that agreed with neither the
 * type ramp nor each other. One path, one stroke, sized in `em` so it tracks
 * whatever it sits beside.
 */
export function Chevron({
  direction = 'right',
  className = '',
}: {
  direction?: 'left' | 'right';
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-[1em] shrink-0 ${direction === 'left' ? 'rotate-180' : ''} ${className}`}
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

/**
 * A row that navigates.
 *
 * Tappable across its full width, not just on the glyph, with the chevron on
 * the same optical margin everywhere it appears. `value` is a detail, never a
 * figure the page has already stated — restating money here is what made the
 * same number appear four times under three labels.
 */
export function NavRow({
  href,
  label,
  value,
  className = '',
}: {
  href: string;
  label: string;
  value?: ReactNode;
  className?: string;
}) {
  return (
    <TLink
      href={href}
      className={`flex min-h-[3.25rem] items-center gap-3 px-5 py-3 transition-colors duration-150 active:bg-accent-wash ${className}`}
    >
      <span className="t-body flex-1">{label}</span>
      {value && <span className="t-caption text-right text-fg-secondary">{value}</span>}
      <Chevron className="t-figure text-fg-tertiary" />
    </TLink>
  );
}

/**
 * A grouped region. A hairline on the page field — never a fill.
 *
 * Every card used to carry --surface-raised, a second surface a shade off the
 * page. Enough of them and the screen reads as a dashboard however flat the
 * shadows are: a stack of filled rectangles is the shape, and the fill is
 * what makes each one an object competing with its neighbours.
 *
 * On a map sheet nothing is a filled block. Separation comes from the rule
 * and from space, so this draws one hairline and otherwise gets out of the
 * way. Where two things need separating and neither is a group, use space
 * instead of reaching for this.
 *
 * The one exception in the app is the "not settled yet" card, which keeps a
 * fill because the fill IS the signal — see NextStep in app/page.tsx.
 */
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-border ${className}`}>{children}</section>
  );
}

/** A hairline-separated list inside a Card. */
export function Group({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-separator">{children}</div>;
}

export function GroupRow({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

/**
 * Money, carrying its own certainty.
 *
 * Every figure in the app goes through here, so no screen can accidentally
 * render an estimate as though it were settled.
 */
export function Money({
  cents,
  estimated,
  size = 'figure',
  className = '',
}: {
  cents: number;
  estimated: boolean;
  size?: 'hero' | 'display' | 'figure';
  className?: string;
}) {
  const amount = formatCents(cents);
  return (
    <span
      className={`t-${size} ${estimated ? 'is-estimated' : 'is-confirmed'} ${className}`}
      aria-label={estimated ? `Estimated ${amount}` : amount}
    >
      <span aria-hidden="true">{amount}</span>
    </span>
  );
}

/** The "not settled yet" line, in the one tinted token. Never the only signal. */
export function EstimateNote({ children }: { children: ReactNode }) {
  return <p className="t-caption text-attention">{children}</p>;
}

const buttonBase =
  'inline-flex min-h-[3.25rem] w-full items-center justify-center gap-2 rounded-xl px-5 text-center transition-[opacity,transform] duration-150 active:scale-[0.985] disabled:pointer-events-none disabled:opacity-35';

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`${buttonBase} bg-accent font-medium text-accent-fg ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={`${buttonBase} bg-accent font-medium text-accent-fg`}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={`${buttonBase} border border-border font-medium text-fg`}
    >
      {children}
    </Link>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="t-caption mt-4 rounded-xl border border-border px-4 py-3 text-critical">
      {children}
    </p>
  );
}

/** Empty states say what to do next, not merely that there is nothing here. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    // No container. A sentence saying there is nothing here does not need a
    // box drawn around the nothing — the space above and below separates it
    // from whatever comes next, which is the whole point of the rule.
    <div className="px-1 py-6">
      <p className="t-heading">{title}</p>
      {children && <p className="t-caption mt-1.5 max-w-[46ch] text-fg-secondary">{children}</p>}
    </div>
  );
}
