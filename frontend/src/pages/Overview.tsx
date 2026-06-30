import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AssigneeStack } from '../components/Avatar';
import { OnboardingCard } from '../components/OnboardingCard';
import type { AssignmentDetail, HouseholdEvent, MoneyStream, User } from '../lib/types';

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
  if (days < 0) return days === -1 ? '1 day ago' : `${-days} days ago`;
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

// A timeline row. Overdue items are tinted rose; far-out items are dimmed.
// Assigned members appear as a compact avatar stack before the urgency pill.
function EventRow({
  evt,
  days,
  tone,
  members,
}: {
  evt: HouseholdEvent;
  days: number;
  tone: 'overdue' | 'week' | 'later';
  members: AssignmentDetail[];
}) {
  const accent = accentMap[eventAccent[evt.event_type]];
  const dot = tone === 'overdue' ? 'bg-rose-500' : tone === 'later' ? 'bg-zinc-600' : accent.dot;
  const title =
    tone === 'overdue' ? 'text-rose-300' : tone === 'later' ? 'text-zinc-400' : 'text-zinc-200';
  const pill =
    tone === 'overdue'
      ? 'bg-rose-500/20 text-rose-400'
      : tone === 'later'
        ? 'bg-zinc-800 text-zinc-500'
        : accent.pill;
  return (
    <li className="flex items-center gap-3">
      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
      <span className={`flex-1 truncate text-sm ${title}`}>{evt.title}</span>
      <AssigneeStack members={members} size="xs" />
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pill}`}>
        {urgencyLabel(days)}
      </span>
    </li>
  );
}

export default function Overview() {
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [usersCount, setUsersCount] = useState(0);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<HouseholdEvent[]>('/events'),
      api.get<MoneyStream[]>('/money-streams'),
      api.get<AssignmentDetail[]>('/assignments'),
      api.get<User[]>('/users'),
    ])
      .then(([evts, strs, asgs, users]) => {
        setEvents(evts.filter((e) => !e.is_completed));
        setEventsTotal(evts.length);
        setStreams(strs);
        setAssignments(asgs);
        setUsersCount(users.length);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Show the first-run checklist until every setup step is satisfied.
  const onboardingComplete = usersCount > 1 && streams.length > 0 && eventsTotal > 0;

  // Index assignments by event so each row can show who's responsible.
  const membersByEvent = new Map<number, AssignmentDetail[]>();
  for (const a of assignments) {
    if (a.event_id == null) continue;
    const list = membersByEvent.get(a.event_id) ?? [];
    list.push(a);
    membersByEvent.set(a.event_id, list);
  }

  // Bucket open events by urgency. Each list stays sorted by date ascending.
  const dated = events
    .map((evt) => ({ evt, days: daysUntil(evt.target_date) }))
    .sort((a, b) => a.days - b.days);
  const overdue = dated.filter((d) => d.days < 0);
  const thisWeek = dated.filter((d) => d.days >= 0 && d.days <= 7);
  const later = dated.filter((d) => d.days > 7);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Home</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Overview</h1>
      </header>

      {/* First-run setup checklist — hides once the household is set up. */}
      {!loading && !error && !onboardingComplete && (
        <OnboardingCard
          usersCount={usersCount}
          streamsCount={streams.length}
          eventsCount={eventsTotal}
        />
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Monthly outflow</p>
          <p className="mt-1 text-xl font-light text-emerald-500">
            {loading ? '—' : `$${formatAmount(streams)}`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Overdue</p>
          <p className="mt-1 text-xl font-light text-rose-500">
            {loading ? '—' : overdue.length}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">This week</p>
          <p className="mt-1 text-xl font-light text-amber-500">
            {loading ? '—' : thisWeek.length}
          </p>
        </div>
      </div>

      {/* Attention list */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Needs attention
        </p>

        {loading && <p className="text-sm text-zinc-500">Loading…</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {!loading && !error && dated.length === 0 && (
          <p className="text-sm text-zinc-500">Nothing coming up — all clear.</p>
        )}

        {!loading && !error && dated.length > 0 && (
          <div className="space-y-5">
            {overdue.length > 0 && (
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-rose-500/80">
                  Overdue
                </p>
                <ul className="space-y-3">
                  {overdue.map(({ evt, days }) => (
                    <EventRow key={evt.id} evt={evt} days={days} tone="overdue" members={membersByEvent.get(evt.id) ?? []} />
                  ))}
                </ul>
              </div>
            )}
            {thisWeek.length > 0 && (
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500">
                  This week
                </p>
                <ul className="space-y-3">
                  {thisWeek.map(({ evt, days }) => (
                    <EventRow key={evt.id} evt={evt} days={days} tone="week" members={membersByEvent.get(evt.id) ?? []} />
                  ))}
                </ul>
              </div>
            )}
            {later.length > 0 && (
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-600">
                  Later
                </p>
                <ul className="space-y-3">
                  {later.map(({ evt, days }) => (
                    <EventRow key={evt.id} evt={evt} days={days} tone="later" members={membersByEvent.get(evt.id) ?? []} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
