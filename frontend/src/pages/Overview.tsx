import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { HouseholdEvent, MoneyStream } from '../lib/types';

type Accent = 'amber' | 'rose' | 'emerald';

const eventAccent: Record<HouseholdEvent['event_type'], Accent> = {
  deadline: 'rose',
  payment: 'emerald',
  appointment: 'amber',
};

const accentMap: Record<Accent, { pill: string; dot: string }> = {
  amber: { pill: 'bg-amber-500/10 text-amber-500', dot: 'bg-amber-500' },
  rose: { pill: 'bg-rose-500/10 text-rose-500', dot: 'bg-rose-500' },
  emerald: { pill: 'bg-emerald-500/10 text-emerald-500', dot: 'bg-emerald-500' },
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / 86_400_000);
}

function urgencyLabel(days: number): string {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function formatAmount(streams: MoneyStream[]): string {
  const monthly = streams
    .filter((s) => s.is_recurring && s.frequency === 'monthly')
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);
  return monthly.toLocaleString('en-US', { minimumFractionDigits: 2 });
}

export default function Overview() {
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<HouseholdEvent[]>('/events?upcoming=true'),
      api.get<MoneyStream[]>('/money-streams'),
    ])
      .then(([evts, strs]) => {
        setEvents(evts.slice(0, 5));
        setStreams(strs);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Home</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Overview</h1>
      </header>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Monthly outflow</p>
          <p className="mt-1 text-xl font-light text-emerald-500">
            {loading ? '—' : `$${formatAmount(streams)}`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Upcoming events</p>
          <p className="mt-1 text-xl font-light text-amber-500">
            {loading ? '—' : events.length}
          </p>
        </div>
      </div>

      {/* Attention list */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Needs attention
        </p>

        {loading && (
          <p className="text-sm text-zinc-500">Loading…</p>
        )}
        {error && (
          <p className="text-sm text-rose-400">{error}</p>
        )}
        {!loading && !error && events.length === 0 && (
          <p className="text-sm text-zinc-500">Nothing coming up — all clear.</p>
        )}
        {!loading && !error && events.length > 0 && (
          <ul className="space-y-3">
            {events.map((evt) => {
              const accent = eventAccent[evt.event_type];
              const styles = accentMap[accent];
              const days = daysUntil(evt.target_date);
              return (
                <li key={evt.id} className="flex items-center gap-3">
                  <span className={`h-2 w-2 flex-shrink-0 rounded-full ${styles.dot}`} />
                  <span className="flex-1 text-sm text-zinc-200">{evt.title}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles.pill}`}>
                    {urgencyLabel(days)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
