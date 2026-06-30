import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { AssignmentDetail, HouseholdEvent } from '../lib/types';
import { Modal } from '../components/Modal';
import { EventForm } from '../components/EventForm';
import { AssigneeStack } from '../components/Avatar';
import { usePreferences } from '../lib/preferences';
import { formatDate } from '../lib/format';

type Accent = 'amber' | 'emerald' | 'rose';

const typeConfig: Record<
  HouseholdEvent['event_type'],
  { accent: Accent; label: string }
> = {
  deadline: { accent: 'rose', label: 'Deadline' },
  payment: { accent: 'emerald', label: 'Payment' },
  appointment: { accent: 'amber', label: 'Appointment' },
};

const accentMap: Record<Accent, { date: string; dot: string; badge: string }> = {
  amber: { date: 'text-amber-500', dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-500' },
  emerald: { date: 'text-emerald-500', dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-500' },
  rose: { date: 'text-rose-500', dot: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-500' },
};

type View = 'upcoming' | 'all' | 'done';
const VIEWS: { key: View; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'all', label: 'All' },
  { key: 'done', label: 'Done' },
];

export default function Timeline() {
  const { locale, timezone } = usePreferences();
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [view, setView] = useState<View>('upcoming');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HouseholdEvent | null>(null);

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
  }, []);

  // Index assignments by event so each row can show who's responsible.
  const membersByEvent = new Map<number, AssignmentDetail[]>();
  for (const a of assignments) {
    if (a.event_id == null) continue;
    const list = membersByEvent.get(a.event_id) ?? [];
    list.push(a);
    membersByEvent.set(a.event_id, list);
  }

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    fetchEvents(view);
  };

  const handleDeleted = () => {
    setEditing(null);
    fetchEvents(view);
  };

  const toggleComplete = async (evt: HouseholdEvent) => {
    try {
      const updated = await api.patch<HouseholdEvent>(`/events/${evt.id}/complete`, {
        is_completed: !evt.is_completed,
      });
      // In a filtered view (Upcoming/Done) a toggled item no longer belongs,
      // so drop it from the list; in All, just reflect the new state.
      setEvents((prev) =>
        view === 'all'
          ? prev.map((e) => (e.id === updated.id ? updated : e))
          : prev.filter((e) => e.id !== updated.id),
      );
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Planning</p>
          <h1 className="mt-1 text-2xl font-light text-zinc-100">Timeline</h1>
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
              {v.label}
            </button>
          ))}
        </div>
      </header>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          {view === 'done' ? (
            <p className="text-sm text-zinc-500">Nothing completed yet — finished items land here.</p>
          ) : view === 'upcoming' ? (
            <>
              <p className="text-sm text-zinc-500">Nothing upcoming.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
              >
                Add an event
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-500">No events yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
              >
                Add your first event
              </button>
            </>
          )}
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <section className="space-y-2">
          {events.map((evt) => {
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
                  {cfg.label}
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
                  aria-label={evt.is_completed ? 'Mark incomplete' : 'Mark complete'}
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
        aria-label="Add event"
        className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <Modal open={showForm} title="New event" onClose={() => setShowForm(false)}>
        <EventForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!editing} title="Edit event" onClose={() => setEditing(null)}>
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
