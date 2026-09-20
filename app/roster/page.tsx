import { redirect } from 'next/navigation';
import { getSettings, getUsualShape, weekDates } from '@/lib/db/queries';
import {
  addDays,
  formatDateRange,
  isSundayWorkDate,
  startOfDublinWeek,
} from '@/lib/time/dublin';
import { RosterForm } from './RosterForm';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function RosterPage(props: PageProps<'/roster'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;

  // Defaults to next week, because the ritual is Sunday night with the new
  // roster in hand. `?week=this` covers the case where you are logging shifts
  // you have already been given for the current week.
  const thisWeek = startOfDublinWeek();
  const weekStart = params.week === 'this' ? thisWeek : addDays(thisWeek, 7);

  const days = weekDates(weekStart).map((date, i) => ({
    date,
    weekday: WEEKDAYS[i],
    dayNumber: String(Number(date.slice(8, 10))),
    sunday: isSundayWorkDate(date),
  }));

  const usual = await getUsualShape(settings);

  return (
    <RosterForm
      weekLabel={`${params.week === 'this' ? 'This week' : 'Next week'} · ${formatDateRange(weekStart, addDays(weekStart, 6))}`}
      days={days}
      usual={usual}
      breaksPaid={settings.breaks_paid}
    />
  );
}
