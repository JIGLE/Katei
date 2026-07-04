import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { todayInTimezone } from '../lib/format';
import { DOT } from './CalendarMonth';
import type { HouseholdEvent } from '../lib/types';

interface WeekStripProps {
  events: HouseholdEvent[];
  /** UI language — weekday names are words, so they follow the interface. */
  lang: string;
  timezone?: string;
  /** Tap a day → open the month calendar on it. */
  onSelectDay: (dayKey: string) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// A seven-day band for the current week, Monday-first (the calendar's
// convention). Each day shows its weekday, number, and up to three event
// dots coloured by type — the same DOT map the month grid uses, so the two
// views speak one visual language. It's a gateway, not a picker: a tap opens
// the full calendar on that day. Colour lives only in the dots; today is an
// emerald number in an inset ring, exactly as in the month grid.
export function WeekStrip({ events, lang, timezone, onSelectDay }: WeekStripProps) {
  const { t } = useTranslation();
  const today = todayInTimezone(timezone); // 'YYYY-MM-DD'

  const days = useMemo(() => {
    const [ty, tm, td] = today.split('-').map(Number);
    const base = new Date(ty, tm - 1, td); // local midnight, safe for arithmetic
    const mondayOffset = (base.getDay() + 6) % 7; // Monday = 0
    return Array.from({ length: 7 }, (_, i) => new Date(ty, tm - 1, td - mondayOffset + i));
  }, [today]);

  const byDay = useMemo(() => {
    const map = new Map<string, HouseholdEvent[]>();
    for (const e of events) {
      const day = e.target_date.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(e);
      map.set(day, list);
    }
    return map;
  }, [events]);

  const weekdayFmt = useMemo(() => new Intl.DateTimeFormat(lang, { weekday: 'short' }), [lang]);
  const labelFmt = useMemo(
    () => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }),
    [lang],
  );

  return (
    <div className="grid grid-cols-7 gap-1 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-2">
      {days.map((d) => {
        const key = keyOf(d);
        const dayEvents = byDay.get(key) ?? [];
        const isToday = key === today;
        const label = [
          labelFmt.format(d),
          ...(dayEvents.length ? [t('timeline.dayEvents', { count: dayEvents.length })] : []),
          ...(isToday ? [t('timeline.today')] : []),
        ].join(', ');
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectDay(key)}
            aria-label={label}
            aria-current={isToday ? 'date' : undefined}
            className={[
              'flex flex-col items-center gap-1 rounded-xl py-2 transition-colors',
              isToday ? 'ring-1 ring-inset ring-zinc-700' : 'hover:bg-zinc-800/50',
            ].join(' ')}
          >
            <span aria-hidden className="text-[0.6rem] uppercase tracking-wide text-zinc-600">
              {weekdayFmt.format(d)}
            </span>
            <span aria-hidden className={`text-sm tabular-nums ${isToday ? 'font-semibold text-emerald-400' : 'text-zinc-300'}`}>
              {d.getDate()}
            </span>
            {/* A fixed-height dot rail keeps every cell the same height whether
                or not it has events, so the numbers stay on one baseline. */}
            <span aria-hidden className="flex h-1 items-center gap-0.5">
              {dayEvents.slice(0, 3).map((e) => (
                <span key={e.id} className={`h-1 w-1 rounded-full ${e.is_completed ? 'bg-zinc-600' : DOT[e.event_type]}`} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
