import Link from 'next/link';
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
        <Link
          href={back.href}
          className="t-caption mb-3 -ml-1 inline-flex min-h-9 items-center gap-1 px-1 text-fg-secondary"
        >
          <span aria-hidden="true">&larr;</span> {back.label}
        </Link>
      )}
      {eyebrow && <p className="t-label text-fg-secondary">{eyebrow}</p>}
      <h1 className="t-title mt-1.5 text-balance">{title}</h1>
    </header>
  );
}

/** A raised surface. Flat — separation comes from the surface step, not shadow. */
export function Card({
  children,
  className = '',
  inverse = false,
}: {
  children: ReactNode;
  className?: string;
  inverse?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl ${
        inverse ? 'bg-surface-inverse text-fg-inverse' : 'bg-surface-raised'
      } ${className}`}
    >
      {children}
    </section>
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

/** The brass "not settled yet" line. Never the only signal, always paired. */
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
    <p role="alert" className="t-caption mt-4 rounded-xl bg-surface-raised px-4 py-3 text-critical">
      {children}
    </p>
  );
}

/** Empty states say what to do next, not merely that there is nothing here. */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Card className="px-5 py-8 text-center">
      <p className="t-heading">{title}</p>
      {children && <p className="t-caption mt-1.5 text-fg-secondary">{children}</p>}
    </Card>
  );
}
