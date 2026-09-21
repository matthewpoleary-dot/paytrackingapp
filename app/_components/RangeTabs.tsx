import Link from 'next/link';
import { RANGE_KINDS, type RangeKind } from '@/lib/pay/range';

const LABEL: Record<RangeKind, string> = {
  week: 'Week',
  month: 'Month',
  year: 'Year',
};

/**
 * Week / Month / Year.
 *
 * Links rather than buttons: each view is a real URL, so it survives a
 * refresh, can be shared, and the back button steps through what you looked
 * at. A client-side toggle would have been less code and worse.
 */
export function RangeTabs({ active, at }: { active: RangeKind; at: string }) {
  return (
    <nav aria-label="Time range" className="flex gap-1 rounded-xl bg-segment-track p-1">
      {RANGE_KINDS.map((kind) => {
        const selected = kind === active;
        return (
          <Link
            key={kind}
            href={`/?range=${kind}&at=${at}`}
            aria-current={selected ? 'page' : undefined}
            className={[
              'flex min-h-9 flex-1 items-center justify-center rounded-[0.625rem]',
              'transition-[background-color,color] duration-150',
              selected
                ? 'bg-segment-pill font-medium text-fg'
                : 'text-fg-secondary active:bg-black/5 dark:active:bg-white/5',
            ].join(' ')}
          >
            <span className="t-caption">{LABEL[kind]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
