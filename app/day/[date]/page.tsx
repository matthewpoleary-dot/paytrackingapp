import { notFound, redirect } from 'next/navigation';
import { getSettings, getShiftsBetween, getShiftsOn, getUsualShape } from '@/lib/db/queries';
import { aggregate, byDay } from '@/lib/pay/aggregate';
import { formatMinutes } from '@/lib/pay/calc';
import { valueShift } from '@/lib/pay/calc';
import { dublinClock, dublinDate, isSundayWorkDate } from '@/lib/time/dublin';
import {
  Card,
  EstimateNote,
  Money,
  PageHeader,
  Screen,
} from '@/app/_components/ui';
import { DateStrip } from '@/app/_components/MonthCalendar';
import { weekDates } from '@/lib/db/queries';
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

  // The week this day sits in, so the strip that got you here is still here
  // and you can step to the next day without going back first.
  const [yy, mm, dd] = date.split('-').map(Number);
  const dow = (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(yy, mm - 1, dd - dow)).toISOString().slice(0, 10);
  const week = weekDates(monday);
  const weekShifts = await getShiftsBetween(week[0], week[6]);
  const weekDays = byDay(weekShifts, settings);
  const peakCents = Math.max(0, ...[...weekDays.values()].map((v) => v.cents));

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
        back={{ href: `/?range=week&at=${date}`, label: 'Shifts' }}
      />

      {/* The same strip as the dashboard, with this day marked. Arriving on a
          screen that shows only the day you tapped makes moving to the next
          one a round trip through the dashboard. */}
      <div className="mb-5">
        <DateStrip
          dates={week}
          days={weekDays}
          today={dublinDate()}
          selected={date}
          peakCents={peakCents}
        />
      </div>

      {shifts.length > 0 && (
        <Card className="mb-3 px-5 py-5">
          <p className="t-caption text-fg-secondary">
            {value.estimated ? 'Worth about' : 'Worth'}
          </p>
          <p className="mt-1.5">
            <Money cents={value.cents} estimated={value.estimated} size="display" />
          </p>
          <p className="t-caption mt-2 text-fg-secondary">
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
