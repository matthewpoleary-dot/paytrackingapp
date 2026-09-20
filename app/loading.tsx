import { Card, Screen } from '@/app/_components/ui';
import { Wordmark } from '@/app/_components/Wordmark';

/**
 * Shown while the dashboard's data is fetched.
 *
 * It mirrors the real layout block for block, so when the content arrives
 * nothing moves. The wordmark is real, not a placeholder — it is the one
 * thing that needs no database, so there is no reason to grey it out.
 */
export default function DashboardLoading() {
  return (
    <Screen>
      <header className="mb-4 flex items-center justify-between gap-2">
        <Wordmark />
        <div className="skeleton h-4 w-16" />
      </header>

      {/* The hero card. Its surface is known immediately; only the figure
          inside it has to wait. */}
      <Card inverse className="px-6 py-6">
        <div className="skeleton-on-inverse h-3 w-40" />
        <div className="skeleton-on-inverse mt-3 h-12 w-56" />
        <div className="skeleton-on-inverse mt-3 h-3 w-48" />
      </Card>

      <div className="mt-6">
        <div className="skeleton mb-2 ml-1 h-3 w-28" />
        <Card className="px-3 py-4">
          <div className="mb-3 flex items-baseline justify-between px-1">
            <div className="skeleton h-7 w-32" />
            <div className="skeleton h-3 w-24" />
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="skeleton aspect-square rounded-lg" />
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="px-4 py-4">
            <div className="skeleton h-2.5 w-20" />
            <div className="skeleton mt-2 h-5 w-24" />
          </Card>
        ))}
      </div>

      <span className="sr-only" role="status">
        Loading your shifts
      </span>
    </Screen>
  );
}
