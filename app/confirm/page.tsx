import { redirect } from 'next/navigation';
import { getSettings, getUnconfirmedShifts } from '@/lib/db/queries';
import { dublinClock, formatDublinTime, formatWorkDate } from '@/lib/time/dublin';
import { Card, Empty, PageHeader, PrimaryLink, Screen } from '@/app/_components/ui';
import { ConfirmForm } from './ConfirmForm';

export default async function ConfirmPage() {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const shifts = await getUnconfirmedShifts();

  if (shifts.length === 0) {
    return (
      <Screen>
        <PageHeader
          eyebrow="Nothing waiting"
          title="Everything is confirmed."
          back={{ href: '/', label: 'This period' }}
        />
        <Empty title="No shifts to confirm">
          Shifts appear here the day after you work them. Until then your period total
          stays an estimate.
        </Empty>
        <div className="mt-auto pt-6">
          <PrimaryLink href="/">Back to this period</PrimaryLink>
        </div>
      </Screen>
    );
  }

  return (
    <ConfirmForm
      breaksPaid={settings.breaks_paid}
      shifts={shifts.map((s) => ({
        id: s.id,
        workDate: s.work_date,
        dayLabel: formatWorkDate(s.work_date),
        start: dublinClock(s.planned_start_at),
        plannedEnd: dublinClock(s.planned_end_at),
        plannedStartLabel: formatDublinTime(s.planned_start_at),
        plannedEndLabel: formatDublinTime(s.planned_end_at),
        plannedBreakMinutes: s.planned_break_minutes,
      }))}
    />
  );
}
