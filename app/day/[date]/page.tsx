import { notFound, redirect } from 'next/navigation';
import { getSettings, getShiftsOn, getUsualShape } from '@/lib/db/queries';
import { aggregate } from '@/lib/pay/aggregate';
import { formatMinutes } from '@/lib/pay/calc';
import { valueShift } from '@/lib/pay/calc';
import { dublinClock, dublinDate, isSundayWorkDate } from '@/lib/time/dublin';
import { Card, EstimateNote, Money, PageHeader, Screen } from '@/app/_components/ui';
import { AddShiftForm, EditShiftForm, type EditableShift } from './DayEditor';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LONG_DATE = new Intl.DateTimeFormat('en-IE', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

export default async function DayPage(props: PageProps<'/day/[date]'>) {
  const { date } = await props.params;
  if (!ISO_DATE.test(date)) notFound();

  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const shifts = await getShiftsOn(date);
  const usual = await getUsualShape(settings);
  const value = aggregate(shifts, settings);

  const [y, m, d] = date.split('-').map(Number);
  const title = LONG_DATE.format(new Date(Date.UTC(y, m - 1, d)));
  const isToday = date === dublinDate();

  const editable: EditableShift[] = shifts.map((s) => ({
    id: s.id,
    start: dublinClock(s.planned_start_at),
    end: dublinClock(s.planned_end_at),
    breakMinutes: s.planned_break_minutes,
    confirmed: s.actuals_confirmed_at !== null,
    actualEnd: s.actual_end_at ? dublinClock(s.actual_end_at) : '',
    actualBreak: s.actual_break_minutes ?? s.planned_break_minutes,
    cents: valueShift(s, settings).cents,
  }));

  return (
    <Screen>
      <PageHeader
        eyebrow={[isToday && 'Today', isSundayWorkDate(date) && 'Sunday']
          .filter(Boolean)
          .join(' · ') || undefined}
        title={title}
        back={{ href: `/?month=${date.slice(0, 7)}`, label: 'Calendar' }}
      />

      {shifts.length > 0 && (
        <Card inverse className="mb-3 px-5 py-5">
          <p className="t-caption opacity-70">
            {value.estimated ? 'Worth about' : 'Worth'}
          </p>
          <p className="mt-1.5">
            <Money cents={value.cents} estimated={value.estimated} size="display" />
          </p>
          <p className="t-caption mt-2 opacity-70">
            {value.shiftCount} shift{value.shiftCount === 1 ? '' : 's'} &middot;{' '}
            {formatMinutes(value.paidMinutes)} paid
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {editable.map((shift, i) => (
          <EditShiftForm
            key={shift.id}
            shift={shift}
            workDate={date}
            breaksPaid={settings.breaks_paid}
            index={i}
          />
        ))}

        <AddShiftForm
          workDate={date}
          breaksPaid={settings.breaks_paid}
          usual={usual}
          compact={shifts.length > 0}
        />
      </div>

      {value.estimated && (
        <div className="mt-3 px-1">
          <EstimateNote>
            Tick &ldquo;I worked this&rdquo; to settle the figure. Until then it assumes
            you finished when rostered and took your break.
          </EstimateNote>
        </div>
      )}

      <div className="h-8" />
    </Screen>
  );
}
