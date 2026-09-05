import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { AssignmentDetail, HouseholdEvent, MoneyStream } from '../lib/types';
import { Modal } from '../components/Modal';
import { EventForm } from '../components/EventForm';
import { EmptyState } from '../components/EmptyState';
import { SearchInput, matchesQuery } from '../components/SearchInput';
import { assignedIds } from '../lib/assignments';
import { CalendarMonth, DOT } from '../components/CalendarMonth';
import { AssigneeStack } from '../components/Avatar';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { useAuth } from '../lib/auth';
import { formatMoney, formatRelativeDay, daysUntil } from '../lib/format';

const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

type Accent = 'amber' | 'emerald' | 'rose' | 'teal';

const typeConfig: Record<
  HouseholdEvent['event_type'],
  { accent: Accent; labelKey: string }
> = {
  deadline: { accent: 'rose', labelKey: 'eventType.deadline' },
  payment: { accent: 'emerald', labelKey: 'eventType.payment' },
  appointment: { accent: 'amber', labelKey: 'eventType.appointment' },
  income: { accent: 'emerald', labelKey: 'eventType.income' },
  savings: { accent: 'teal', labelKey: 'eventType.savings' },
};

const accentMap: Record<Accent, { pill: string }> = {
  amber: { pill: 'border-amber-500/40 bg-amber-500/10 text-amber-500' },
  emerald: { pill: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' },
  rose: { pill: 'border-rose-500/40 bg-rose-500/10 text-rose-500' },
  teal: { pill: 'border-teal-500/40 bg-teal-500/10 text-teal-300' },
};

export default function Timeline() {
  const { locale, timezone, currency, money_enabled } = usePreferences();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [streams, setStreams] = useState<Record<number, { amount: string; currency: string }>>({});
  // A deep link from the home week strip or "upcoming" list lands here as ?day=…
  const [searchParams] = useSearchParams();
  const [selectedDay, setSelectedDay] = useState<string | null>(() => searchParams.get('day') ?? null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<HouseholdEvent['event_type'] | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HouseholdEvent | null>(null);
  const [paying, setPaying] = useState<HouseholdEvent | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const fetchEvents = () => {
    setLoading(true);
    api
      .get<HouseholdEvent[]>('/events')
      .then(setEvents)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // The calendar needs every event (including completed, for its dots and for
  // a selected day's history) — there's no separate filtered fetch anymore.
  useEffect(() => { fetchEvents(); }, []);

  // Assignments and money streams are independent of day selection — load once.
  useEffect(() => {
    api.get<AssignmentDetail[]>('/assignments').then(setAssignments).catch(() => {});
    // Money streams let "mark as paid" prefill the expected amount + currency
    // — skipped outright when money is off, nothing to prefill.
    if (!money_enabled) return;
    api.get<MoneyStream[]>('/money-streams').then((rows) => {
      const m: Record<number, { amount: string; currency: string }> = {};
      for (const s of rows) m[s.id] = { amount: s.amount, currency: s.currency };
      setStreams(m);
    }).catch(() => {});
  }, [money_enabled]);

  // Index assignments by event so each row can show who's responsible.
  const membersByEvent = new Map<number, AssignmentDetail[]>();
  for (const a of assignments) {
    if (a.event_id == null) continue;
    const list = membersByEvent.get(a.event_id) ?? [];
    list.push(a);
    membersByEvent.set(a.event_id, list);
  }
  const mineEventIds = assignedIds(assignments, user?.id, 'event_id');

  const dayKeyOf = (e: HouseholdEvent) => e.target_date.slice(0, 10);

  // The two possible base sets: everything on the selected day, or every open
  // event closest-in-time-first. Only one is ever actually shown.
  const dayEventsAll = selectedDay ? events.filter((e) => dayKeyOf(e) === selectedDay) : [];
  const nearestUpcomingAll = events
    .filter((e) => !e.is_completed)
    .sort((a, b) => a.target_date.localeCompare(b.target_date)); // ISO dates sort correctly as text
  const activeAll = selectedDay ? dayEventsAll : nearestUpcomingAll;

  // "Assigned to me" narrows first (mirrors the pre-redesign two-step empty
  // state priority: a plain empty scope reads differently from "nothing of
  // mine in a non-empty scope"), then search/type narrow further.
  const mineFilteredActive = activeAll.filter((e) => !mineOnly || mineEventIds.has(e.id));
  const searchingActive = query.trim() !== '' || typeFilter !== 'all';
  const visibleActive = mineFilteredActive.filter(
    (e) => (typeFilter === 'all' || e.event_type === typeFilter) && matchesQuery(query, e.title, e.description),
  );

  const selectedDayCaption = selectedDay
    ? new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(`${selectedDay}T00:00:00`),
      )
    : t('timeline.upcomingHeading');

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    fetchEvents();
  };

  const handleDeleted = () => {
    setEditing(null);
    fetchEvents();
  };

  const applyUpdate = (updated: HouseholdEvent) =>
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

  const toggleComplete = async (evt: HouseholdEvent) => {
    // Completing a payment opens the "mark as paid" prompt to capture the
    // actual amount; everything else (incl. un-completing) toggles directly.
    // With money off there's nothing to capture — it completes like any event.
    if (money_enabled && !evt.is_completed && evt.event_type === 'payment') {
      const linked = evt.money_stream_id != null ? streams[evt.money_stream_id] : undefined;
      setPayAmount(linked ? String(linked.amount) : '');
      setPaying(evt);
      return;
    }
    try {
      const updated = await api.patch<HouseholdEvent>(`/events/${evt.id}/complete`, {
        is_completed: !evt.is_completed,
      });
      applyUpdate(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const payCurrency =
    paying?.money_stream_id != null ? streams[paying.money_stream_id]?.currency ?? currency : currency;

  const confirmPaid = async () => {
    if (!paying) return;
    const amt = parseFloat(payAmount);
    const body: Record<string, unknown> = { is_completed: true };
    if (!Number.isNaN(amt) && amt >= 0) body.actual_amount = amt;
    try {
      const updated = await api.patch<HouseholdEvent>(`/events/${paying.id}`, body);
      applyUpdate(updated);
      setPaying(null);
      setPayAmount('');
    } catch (e) {
      console.error(e);
    }
  };

  const renderRow = (evt: HouseholdEvent, i: number) => {
    const overdue = !evt.is_completed && daysUntil(evt.target_date, timezone) < 0;
    const linked = money_enabled && evt.money_stream_id != null ? streams[evt.money_stream_id] : undefined;
    const amount =
      money_enabled && evt.event_type === 'payment'
        ? evt.actual_amount != null
          ? formatMoney(evt.actual_amount, linked?.currency ?? currency, locale)
          : linked
            ? formatMoney(linked.amount, linked.currency, locale)
            : null
        : null;
    return (
      <div
        key={evt.id}
        style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
        className={[
          'flex h-14 items-center gap-3 px-4 transition-opacity animate-fade-slide-in',
          evt.is_completed ? 'opacity-50' : '',
        ].join(' ')}
      >
        <button
          onClick={() => toggleComplete(evt)}
          className={[
            'flex-shrink-0 h-5 w-5 rounded-full border-2 transition-colors',
            evt.is_completed ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600 hover:border-zinc-400',
          ].join(' ')}
          aria-label={evt.is_completed ? t('timeline.markIncomplete') : t('timeline.markComplete')}
        >
          {evt.is_completed && (
            <svg className="m-auto h-3 w-3 text-zinc-900" viewBox="0 0 12 12" fill="currentColor">
              <path
                className="check-draw"
                pathLength={1}
                d="M10 3L5 8.5 2 5.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          )}
        </button>

        <button type="button" onClick={() => setEditing(evt)} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-sm ${evt.is_completed ? 'line-through text-zinc-500' : overdue ? 'text-rose-400' : 'text-zinc-100'}`}>
            {evt.title}
          </p>
        </button>

        {amount && <span className="flex-shrink-0 text-xs tabular-nums text-zinc-400">{amount}</span>}

        <AssigneeStack members={membersByEvent.get(evt.id) ?? []} size="xs" />

        {selectedDay ? (
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${evt.is_completed ? 'bg-zinc-600' : DOT[evt.event_type]}`} />
        ) : (
          <span
            className={[
              'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
              overdue ? 'bg-rose-500/20 text-rose-400' : 'bg-zinc-800 text-zinc-400',
            ].join(' ')}
          >
            {formatRelativeDay(daysUntil(evt.target_date, timezone), i18n.language)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t('timeline.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">{t('timeline.title')}</h1>
      </header>

      {!error && (
        <CalendarMonth
          events={events}
          lang={i18n.language}
          timezone={timezone}
          selectedDay={selectedDay}
          onSelectDay={(day) => setSelectedDay((prev) => (day != null && prev === day ? null : day))}
        />
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}

      {!loading && !error && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{selectedDayCaption}</p>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-pressed={filtersOpen}
              aria-label={t('timeline.filtersAria')}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z" />
              </svg>
            </button>
          </div>

          {filtersOpen && (
            <div className="space-y-2">
              <SearchInput value={query} onChange={setQuery} label={t('search.events')} />
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]">
                <button
                  type="button"
                  onClick={() => setMineOnly((v) => !v)}
                  aria-pressed={mineOnly}
                  className={[
                    'flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    mineOnly
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                      : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
                  ].join(' ')}
                >
                  {t('timeline.assignedToMe')}
                </button>
                <span aria-hidden className="my-1 w-px flex-shrink-0 bg-zinc-800" />
                {(['all', ...Object.keys(typeConfig)] as (HouseholdEvent['event_type'] | 'all')[]).map((tk) => (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => setTypeFilter(tk)}
                    aria-pressed={typeFilter === tk}
                    className={[
                      'flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      typeFilter === tk
                        ? tk === 'all'
                          ? 'border-zinc-600 bg-zinc-800 text-zinc-100'
                          : accentMap[typeConfig[tk].accent].pill
                        : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
                    ].join(' ')}
                  >
                    {t(tk === 'all' ? 'eventType.all' : typeConfig[tk].labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {visibleActive.length === 0 && searchingActive && mineFilteredActive.length > 0 && (
            <EmptyState icon="🔍" title={t('search.noMatches')} hint={t('search.noMatchesHint')} />
          )}

          {mineFilteredActive.length === 0 && mineOnly && activeAll.length > 0 && (
            <EmptyState icon="🧹" title={t('timeline.noneAssigned')} hint={t('timeline.noneAssignedHint')} />
          )}

          {activeAll.length === 0 && (
            selectedDay ? (
              <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 py-6 text-center">
                <p className="text-xs text-zinc-600">{t('timeline.noEventsThisDay')}</p>
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="mx-auto mt-2 block text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
                >
                  ＋ {t('timeline.addOnDay', {
                    date: new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }).format(
                      new Date(`${selectedDay}T00:00:00`),
                    ),
                  })}
                </button>
              </div>
            ) : events.length === 0 ? (
              <EmptyState
                icon="🌱"
                title={t('timeline.noEventsYet')}
                hint={t('timeline.nothingUpcomingHint')}
                actionLabel={t('timeline.addFirstEvent')}
                onAction={() => setShowForm(true)}
              />
            ) : (
              <EmptyState
                icon="🌱"
                title={t('timeline.nothingUpcoming')}
                hint={t('timeline.nothingUpcomingHint')}
                actionLabel={t('timeline.addEvent')}
                onAction={() => setShowForm(true)}
              />
            )
          )}

          {visibleActive.length > 0 && (
            <section className="divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
              {visibleActive.map((evt, i) => renderRow(evt, i))}
            </section>
          )}
        </div>
      )}

      {/* Floating add button — sits above the fixed bottom nav. */}
      <button
        onClick={() => setShowForm(true)}
        aria-label={t('timeline.addEventAria')}
        className="fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <Modal open={showForm} title={t('timeline.newEvent')} onClose={() => setShowForm(false)}>
        <EventForm
          key={selectedDay ?? 'blank'}
          initialDate={selectedDay ?? undefined}
          onSaved={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      </Modal>

      <Modal open={!!paying} title={t('timeline.markPaidTitle')} onClose={() => setPaying(null)}>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">{paying?.title}</p>
          <div>
            <label htmlFor="paid_amount" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500">
              {t('timeline.amountPaid')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="paid_amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
                className={fieldCls}
              />
              <span className="flex-shrink-0 text-sm text-zinc-500">{payCurrency}</span>
            </div>
            <p className="mt-1.5 text-xs text-zinc-500">{t('timeline.amountPaidHint')}</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPaying(null)}
              className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmPaid}
              className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90"
            >
              {t('timeline.markPaid')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!editing} title={t('timeline.editEvent')} onClose={() => setEditing(null)}>
        {editing && (
          <EventForm
            initial={editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            onDeleted={handleDeleted}
          />
        )}
      </Modal>
    </div>
  );
}
