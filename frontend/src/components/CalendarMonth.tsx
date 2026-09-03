import { useMemo, useRef, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { todayInTimezone } from '../lib/format';
import type { HouseholdEvent } from '../lib/types';

interface CalendarMonthProps {
  events: HouseholdEvent[];
  /** UI language — month/weekday names are words, so they follow the interface. */
  lang: string;
  timezone?: string;
  /** The day (YYYY-MM-DD) the caller is treating as selected, or null for none. */
  selectedDay: string | null;
  /** Fires with the tapped day, or null when re-tapping the selected day (or
      paging the month) clears the selection — the caller owns what "selected"
      means for the rest of the page. */
  onSelectDay: (day: string | null) => void;
}

// Dot colour per event type (matches the Timeline/BRAND semantic accents).
// Exported so the home's week strip reads from one source of truth.
export const DOT: Record<HouseholdEvent['event_type'], string> = {
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
//
// Accessibility: a real ARIA grid — one tab stop, then arrow keys move by day
// and week, Home/End jump within the month, PageUp/PageDown change month.
// Each day announces its full date, its event count, and today; the dots are
// decoration only.
export function CalendarMonth({ events, lang, timezone, selectedDay, onSelectDay }: CalendarMonthProps) {
  const { t } = useTranslation();
  const today = todayInTimezone(timezone); // 'YYYY-MM-DD'
  // A selected/deep-linked day opens its month; otherwise today's. Read only
  // once on mount — selectedDay only ever changes via this component's own
  // callback round-tripping back in, never from an unrelated external trigger.
  const start = selectedDay ?? today;
  const [cursor, setCursor] = useState(() => {
    const [y, m] = start.split('-').map(Number);
    return { y, m: m - 1 }; // month is 0-indexed
  });
  // The roving tab stop: which day of the displayed month is focusable.
  const [focusDay, setFocusDay] = useState(() => Number(start.slice(8)));
  // Focus moves only on keyboard navigation, never on plain re-renders.
  const shouldFocus = useRef(false);
  const cellRefs = useRef(new Map<number, HTMLButtonElement>());

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
  const rovingDay = Math.min(focusDay, daysInMonth);

  const monthLabel = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' }).format(new Date(y, m, 1));
  const dayName = (d: number) =>
    new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(y, m, d));
  // Weekday headers, Monday-first, in the UI locale.
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang, { weekday: 'short' });
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i))); // 2024-01-01 is a Monday
  }, [lang]);

  const shift = (delta: number) => {
    const d = new Date(y, m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    onSelectDay(null);
  };

  // After keyboard navigation (possibly across a month boundary), put real
  // focus on the new roving cell once it exists.
  useEffect(() => {
    if (!shouldFocus.current) return;
    shouldFocus.current = false;
    cellRefs.current.get(rovingDay)?.focus();
  }, [rovingDay, y, m]);

  const moveFocus = (target: Date) => {
    shouldFocus.current = true;
    if (target.getFullYear() !== y || target.getMonth() !== m) {
      setCursor({ y: target.getFullYear(), m: target.getMonth() });
    }
    setFocusDay(target.getDate());
  };

  const onGridKey = (e: React.KeyboardEvent) => {
    const d = rovingDay;
    let target: Date | null = null;
    switch (e.key) {
      case 'ArrowRight': target = new Date(y, m, d + 1); break;
      case 'ArrowLeft': target = new Date(y, m, d - 1); break;
      case 'ArrowDown': target = new Date(y, m, d + 7); break;
      case 'ArrowUp': target = new Date(y, m, d - 7); break;
      case 'Home': target = new Date(y, m, 1); break;
      case 'End': target = new Date(y, m, daysInMonth); break;
      case 'PageUp': target = new Date(y, m - 1, Math.min(d, new Date(y, m, 0).getDate())); break;
      case 'PageDown': target = new Date(y, m + 1, Math.min(d, new Date(y, m + 2, 0).getDate())); break;
      default: return;
    }
    e.preventDefault();
    moveFocus(target);
  };

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  cellRefs.current.clear();

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

      <div role="grid" aria-label={monthLabel} onKeyDown={onGridKey} className="text-center">
        <div role="row" className="grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div key={w} role="columnheader" className="pb-1 text-[0.65rem] uppercase tracking-wide text-zinc-600">{w}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} role="row" className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (day === null) return <div key={`b${di}`} role="gridcell" aria-hidden />;
              const dayKey = keyOf(y, m, day);
              const dayEvents = byDay.get(dayKey) ?? [];
              const isToday = dayKey === today;
              const isSelected = dayKey === selectedDay;
              const label = [
                dayName(day),
                ...(dayEvents.length ? [t('timeline.dayEvents', { count: dayEvents.length })] : []),
                ...(isToday ? [t('timeline.today')] : []),
              ].join(', ');
              return (
                <button
                  key={dayKey}
                  ref={(el) => { if (el) cellRefs.current.set(day, el); }}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  aria-label={label}
                  tabIndex={day === rovingDay ? 0 : -1}
                  onClick={() => { onSelectDay(dayKey); setFocusDay(day); }}
                  className={[
                    'flex aspect-square flex-col items-center justify-center gap-1 rounded-lg text-sm transition-colors',
                    isSelected ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-800/50',
                    isToday && !isSelected ? 'ring-1 ring-inset ring-zinc-700' : '',
                  ].join(' ')}
                >
                  <span aria-hidden className={`tabular-nums ${isToday ? 'font-semibold text-emerald-400' : ''}`}>{day}</span>
                  {dayEvents.length > 0 && (
                    <span aria-hidden className="flex gap-0.5">
                      {dayEvents.slice(0, 3).map((e) => (
                        <span key={e.id} className={`h-1 w-1 rounded-full ${e.is_completed ? 'bg-zinc-600' : DOT[e.event_type]}`} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
