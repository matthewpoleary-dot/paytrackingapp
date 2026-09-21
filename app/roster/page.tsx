import { redirect } from 'next/navigation';
import { getSettings, getUsualShape, weekDates } from '@/lib/db/queries';
import { addDays, formatDateRange, isSundayWorkDate, startOfDublinWeek } from '@/lib/time/dublin';
import { startOfWeek } from '@/lib/pay/range';
import { RosterForm } from './RosterForm';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function RosterPage(props: PageProps<'/roster'>) {
  const settings = await getSettings();
  if (!settings) redirect('/setup');

  const params = await props.searchParams;
  const thisWeek = startOfDublinWeek();

  // `start` pins an exact week — any week, past or future. Without it the
  // default is next week, because the ritual is Sunday night with the new
  // roster in hand; `week=this` covers shifts already given for this week.
  const weekStart =
    typeof params.start === 'string' && ISO_DATE.test(params.start)
      ? startOfWeek(params.start)
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
        : weekStart === addDays(thisWeek, -7)
          ? 'Last week'
          : weekStart < thisWeek
            ? 'Earlier'
            : 'Ahead';

  const usual = await getUsualShape(settings);

  return (
    <RosterForm
      weekStart={weekStart}
      previousWeek={addDays(weekStart, -7)}
      nextWeek={addDays(weekStart, 7)}
      relative={relative}
      weekRange={formatDateRange(weekStart, addDays(weekStart, 6))}
      isThisWeek={weekStart === thisWeek}
      days={days}
      usual={usual}
      breaksPaid={settings.breaks_paid}
    />
  );
}
