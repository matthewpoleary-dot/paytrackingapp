import { TLink } from '@/app/_components/TLink';

type Tab = 'shifts' | 'budget' | 'ai';

const TABS: { id: Tab; href: string; label: string }[] = [
  { id: 'shifts', href: '/', label: 'Shifts' },
  { id: 'budget', href: '/budget', label: 'Budget' },
  { id: 'ai', href: '/ai', label: 'Ask' },
];

/**
 * The three tabs.
 *
 * Fixed to the bottom, where a thumb is. Named for what they contain rather
 * than by an umbrella — "Shifts", not "Home" — because a specific label is
 * predictable and a vague one is not.
 *
 * Translucent rather than opaque so content scrolls under it: at 390px a
 * solid bar costs a chunk of an already short screen.
 */
export function TabBar({ active }: { active: Tab }) {
  return (
    <>
      {/* Reserves the height the fixed bar takes, so nothing hides behind it. */}
      <div aria-hidden="true" className="h-[calc(3.75rem+env(safe-area-inset-bottom))]" />

      <nav
        aria-label="Sections"
        className="u-chrome fixed inset-x-0 bottom-0 z-40 border-t border-separator bg-[var(--surface-chrome)] backdrop-blur-xl"
      >
        <div className="mx-auto flex w-full max-w-md items-stretch px-2 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((tab) => {
            const current = tab.id === active;
            return (
              <TLink
                key={tab.id}
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={[
                  'flex min-h-14 flex-1 items-center justify-center rounded-lg',
                  'transition-colors duration-150',
                  current ? 'text-fg' : 'text-fg-secondary active:bg-segment-track',
                ].join(' ')}
              >
                <span className={`t-caption ${current ? 'font-medium' : ''}`}>{tab.label}</span>
              </TLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}
