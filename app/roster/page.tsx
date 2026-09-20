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
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The Monday on or before a given date. Periods need not start on a Monday. */
function mondayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; // Mon = 0
  return addDays(isoDate, -dow);
}

export default async function RosterPage(props: PageProps<'/roster'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const thisWeek = startOfDublinWeek();

  // `start` pins an exact week; otherwise next week, because the ritual is
  // Sunday night with the new roster in hand. `week=this` covers shifts you
  // have already been given for the current week.
  const weekStart =
    typeof params.start === 'string' && ISO_DATE.test(params.start)
      ? mondayOf(params.start)
      : params.week === 'this'
        ? thisWeek
        : addDays(thisWeek, 7);

  const days = weekDates(weekStart).map((date, i) => ({
    date,
    weekday: WEEKDAYS[i],
    dayNumber: String(Number(date.slice(8, 10))),
    sunday: isSundayWorkDate(date),
  }));

  const relative =
    weekStart === thisWeek
      ? 'This week'
      : weekStart === addDays(thisWeek, 7)
        ? 'Next week'
        : weekStart < thisWeek
          ? 'Earlier week'
          : 'Week of';

  const usual = await getUsualShape(settings);

  return (
    <RosterForm
      weekLabel={`${relative} · ${formatDateRange(weekStart, addDays(weekStart, 6))}`}
      days={days}
      usual={usual}
      breaksPaid={settings.breaks_paid}
    />
  );
}

