import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { todayInTimezone } from '../lib/format';
import type { HouseholdEvent } from '../lib/types';

interface CalendarMonthProps {
  events: HouseholdEvent[];
  /** UI language — month/weekday names are words, so they follow the interface. */
  lang: string;
  timezone?: string;
  onSelectEvent: (evt: HouseholdEvent) => void;
}

// Dot colour per event type (matches the Timeline/BRAND semantic accents).
const DOT: Record<HouseholdEvent['event_type'], string> = {
  deadline: 'bg-rose-500',
  payment: 'bg-emerald-500',
  appointment: 'bg-amber-500',
  income: 'bg-emerald-500',
  savings: 'bg-teal-400',
};

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// A compact month grid of events. Days with events show coloured dots; tap a day
// to list its events, tap an event to open it. Monday-first, locale-aware labels.
export function CalendarMonth({ events, lang, timezone, onSelectEvent }: CalendarMonthProps) {
  const { t } = useTranslation();
  const today = todayInTimezone(timezone); // 'YYYY-MM-DD'
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 }; // month is 0-indexed
  });
  const [selected, setSelected] = useState<string | null>(today);

  // Group events by their day for quick lookup.
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

  const { y, m } = cursor;
  const firstWeekday = (new Date(y, m, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const monthLabel = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
  // Weekday headers, Monday-first, in the UI locale.
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i))); // 2024-01-01 is a Monday
  }, [lang]);

  const shift = (delta: number) => {
    const d = new Date(y, m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setSelected(null);
  };

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const selectedEvents = selected ? byDay.get(selected) ?? [] : [];

  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          aria-label={t('timeline.prevMonth')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          ‹
        </button>
        <p className="text-sm font-medium capitalize text-zinc-100">{monthLabel}</p>
        <button
          type="button"
          onClick={() => shift(1)}
          aria-label={t('timeline.nextMonth')}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w) => (
          <div key={w} className="pb-1 text-[0.65rem] uppercase tracking-wide text-zinc-600">{w}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`b${i}`} />;
          const dayKey = keyOf(y, m, day);
          const dayEvents = byDay.get(dayKey) ?? [];
          const isToday = dayKey === today;
          const isSelected = dayKey === selected;
          return (
            <button
              key={dayKey}
              type="button"
              onClick={() => setSelected(dayKey)}
              className={[
                'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors',
                isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/50',
                isToday && !isSelected ? 'ring-1 ring-inset ring-zinc-700' : '',
              ].join(' ')}
            >
              <span className={`tabular-nums ${isToday ? 'font-semibold text-emerald-400' : ''}`}>{day}</span>
              {dayEvents.length > 0 && (
                <span className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((e) => (
                    <span key={e.id} className={`h-1 w-1 rounded-full ${e.is_completed ? 'bg-zinc-600' : DOT[e.event_type]}`} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* The selected day's events */}
      {selected && (
        <div className="mt-4 border-t border-zinc-800/60 pt-3">
          {selectedEvents.length === 0 ? (
            <p className="py-2 text-center text-xs text-zinc-600">{t('timeline.noEventsThisDay')}</p>
          ) : (
            <ul className="space-y-2">
              {selectedEvents.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onSelectEvent(e)}
                    className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-zinc-800/40"
                  >
                    <span className={`h-2 w-2 flex-shrink-0 rounded-full ${e.is_completed ? 'bg-zinc-600' : DOT[e.event_type]}`} />
                    <span className={`flex-1 truncate ${e.is_completed ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>{e.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
