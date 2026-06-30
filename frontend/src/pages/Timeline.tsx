import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AssignmentDetail, HouseholdEvent, MoneyStream } from '../lib/types';
import { Modal } from '../components/Modal';
import { EventForm } from '../components/EventForm';
import { AssigneeStack } from '../components/Avatar';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { useAuth } from '../lib/auth';
import { formatDate } from '../lib/format';

const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

type Accent = 'amber' | 'emerald' | 'rose';

const typeConfig: Record<
  HouseholdEvent['event_type'],
  { accent: Accent; labelKey: string }
> = {
  deadline: { accent: 'rose', labelKey: 'eventType.deadline' },
  payment: { accent: 'emerald', labelKey: 'eventType.payment' },
  appointment: { accent: 'amber', labelKey: 'eventType.appointment' },
  income: { accent: 'emerald', labelKey: 'eventType.income' },
};

const accentMap: Record<Accent, { date: string; dot: string; badge: string }> = {
  amber: { date: 'text-amber-500', dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-500' },
  emerald: { date: 'text-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-500' },
  rose: { date: 'text-rose-500', dot: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-500' },
};

type View = 'upcoming' | 'all' | 'done';
const VIEWS: { key: View; labelKey: string }[] = [
  { key: 'upcoming', labelKey: 'timeline.viewUpcoming' },
  { key: 'all', labelKey: 'timeline.viewAll' },
  { key: 'done', labelKey: 'timeline.viewDone' },
];

export default function Timeline() {
  const { locale, timezone, currency } = usePreferences();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [streams, setStreams] = useState<Record<number, { amount: string; currency: string }>>({});
  const [view, setView] = useState<View>('upcoming');
  const [mineOnly, setMineOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HouseholdEvent | null>(null);
  const [paying, setPaying] = useState<HouseholdEvent | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const fetchEvents = (v: View) => {
    setLoading(true);
    const path = v === 'upcoming' ? '/events?upcoming=true' : '/events';
    api
      .get<HouseholdEvent[]>(path)
      .then((rows) => {
        if (v === 'done') {
          // History: completed items, most recently due first.
          setEvents(
            rows
              .filter((e) => e.is_completed)
              .sort((a, b) => b.target_date.localeCompare(a.target_date)),
          );
        } else {
          setEvents(rows);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEvents(view); }, [view]);

  // Assignments are independent of the upcoming/all toggle — load once.
  useEffect(() => {
    api.get<AssignmentDetail[]>('/assignments').then(setAssignments).catch(() => {});
    // Money streams let "mark as paid" prefill the expected amount + currency.
    api.get<MoneyStream[]>('/money-streams').then((rows) => {
      const m: Record<number, { amount: string; currency: string }> = {};
      for (const s of rows) m[s.id] = { amount: s.amount, currency: s.currency };
      setStreams(m);
    }).catch(() => {});
  }, []);

  // Index assignments by event so each row can show who's responsible.
  const membersByEvent = new Map<number, AssignmentDetail[]>();
  for (const a of assignments) {
    if (a.event_id == null) continue;
    const list = membersByEvent.get(a.event_id) ?? [];
    list.push(a);
    membersByEvent.set(a.event_id, list);
  }

  // Events assigned to the logged-in member, for the "Assigned to me" filter.
  const mineEventIds = new Set(
    assignments
      .filter((a) => a.user_id === user?.id && a.event_id != null)
      .map((a) => a.event_id as number),
  );
  const visible = mineOnly ? events.filter((e) => mineEventIds.has(e.id)) : events;

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    fetchEvents(view);
  };

  const handleDeleted = () => {
    setEditing(null);
    fetchEvents(view);
  };

  // In a filtered view (Upcoming/Done) a toggled item no longer belongs, so
  // drop it from the list; in All, just reflect the new state.
  const applyUpdate = (updated: HouseholdEvent) =>
    setEvents((prev) =>
      view === 'all'
        ? prev.map((e) => (e.id === updated.id ? updated : e))
        : prev.filter((e) => e.id !== updated.id),
    );

  const toggleComplete = async (evt: HouseholdEvent) => {
    // Completing a payment opens the "mark as paid" prompt to capture the
    // actual amount; everything else (incl. un-completing) toggles directly.
    if (!evt.is_completed && evt.event_type === 'payment') {
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

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('timeline.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-light text-zinc-100">{t('timeline.title')}</h1>
        </div>
        {/* View filter */}
        <div className="flex gap-1 rounded-xl border border-zinc-800/60 bg-zinc-900 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={[
                'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                view === v.key ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t(v.labelKey)}
            </button>
          ))}
        </div>
        {/* Personal filter — only events assigned to me. */}
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          aria-pressed={mineOnly}
          className={[
            'self-start rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            mineOnly
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
              : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
          ].join(' ')}
        >
          {t('timeline.assignedToMe')}
        </button>
      </header>

      {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && visible.length === 0 && mineOnly && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">{t('timeline.noneAssigned')}</p>
        </div>
      )}

      {!loading && !error && events.length === 0 && !mineOnly && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          {view === 'done' ? (
            <p className="text-sm text-zinc-500">{t('timeline.nothingCompleted')}</p>
          ) : view === 'upcoming' ? (
            <>
              <p className="text-sm text-zinc-500">{t('timeline.nothingUpcoming')}</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
              >
                {t('timeline.addEvent')}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-500">{t('timeline.noEventsYet')}</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
              >
                {t('timeline.addFirstEvent')}
              </button>
            </>
          )}
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <section className="space-y-2">
          {visible.map((evt) => {
            const cfg = typeConfig[evt.event_type];
            const styles = accentMap[cfg.accent];
            return (
              <div
                key={evt.id}
                className={[
                  'flex items-center gap-4 rounded-2xl border bg-zinc-900 p-4 transition-opacity',
                  evt.is_completed ? 'border-zinc-800/30 opacity-50' : 'border-zinc-800/60',
                ].join(' ')}
              >
                {/* Date */}
                <div
                  className={`w-14 flex-shrink-0 border-r border-zinc-800/60 pr-4 text-center text-xs font-medium ${styles.date}`}
                >
                  {formatDate(evt.target_date, locale, timezone)}
                </div>

                {/* Content — tap to edit */}
                <button
                  type="button"
                  onClick={() => setEditing(evt)}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className={`text-sm ${evt.is_completed ? 'line-through text-zinc-500' : 'text-zinc-100'}`}>
                    {evt.title}
                  </p>
                  {evt.description && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{evt.description}</p>
                  )}
                </button>

                {/* Responsible members */}
                <AssigneeStack members={membersByEvent.get(evt.id) ?? []} size="xs" />

                {/* Type badge */}
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${styles.badge}`}>
                  {t(cfg.labelKey)}
                </span>

                {/* Complete toggle */}
                <button
                  onClick={() => toggleComplete(evt)}
                  className={[
                    'flex-shrink-0 h-5 w-5 rounded-full border-2 transition-colors',
                    evt.is_completed
                      ? 'border-emerald-500 bg-emerald-500'
                      : 'border-zinc-600 hover:border-zinc-400',
                  ].join(' ')}
                  aria-label={evt.is_completed ? t('timeline.markIncomplete') : t('timeline.markComplete')}
                >
                  {evt.is_completed && (
                    <svg className="m-auto h-3 w-3 text-zinc-900" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* Floating add button — sits above the fixed bottom nav. */}
      <button
        onClick={() => setShowForm(true)}
        aria-label={t('timeline.addEventAria')}
        className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <Modal open={showForm} title={t('timeline.newEvent')} onClose={() => setShowForm(false)}>
        <EventForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
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
