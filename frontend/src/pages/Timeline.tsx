import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { HouseholdEvent } from '../lib/types';
import { Modal } from '../components/Modal';
import { EventForm } from '../components/EventForm';

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function Timeline() {
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<HouseholdEvent | null>(null);

  const fetchEvents = (all: boolean) => {
    setLoading(true);
    const path = all ? '/events' : '/events?upcoming=true';
    api
      .get<HouseholdEvent[]>(path)
      .then(setEvents)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEvents(showAll); }, [showAll]);

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    fetchEvents(showAll);
  };

  const handleDeleted = () => {
    setEditing(null);
    fetchEvents(showAll);
  };

  const toggleComplete = async (evt: HouseholdEvent) => {
    try {
      const updated = await api.patch<HouseholdEvent>(`/events/${evt.id}/complete`, {
        is_completed: !evt.is_completed,
      });
      setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Planning</p>
          <h1 className="mt-1 text-2xl font-light text-zinc-100">Timeline</h1>
        </div>
        <button
          onClick={() => setShowAll((v) => !v)}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300"
        >
          {showAll ? 'Upcoming only' : 'Show all'}
        </button>
      </header>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">No events yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
          >
            Add your first event
          </button>
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
                  {formatDate(evt.target_date)}
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
