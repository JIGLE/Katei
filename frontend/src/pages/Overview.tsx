import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AssigneeStack } from '../components/Avatar';
import { OnboardingCard } from '../components/OnboardingCard';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { formatMoney, daysUntil, formatRelativeDay } from '../lib/format';
import type { AssignmentDetail, HouseholdEvent, MoneyStream, User } from '../lib/types';

type Accent = 'amber' | 'rose' | 'emerald';

const eventAccent: Record<HouseholdEvent['event_type'], Accent> = {
  deadline: 'rose',
  payment: 'emerald',
  appointment: 'amber',
  income: 'emerald',
};

const accentMap: Record<Accent, { pill: string; dot: string }> = {
  amber: { pill: 'bg-amber-500/10 text-amber-500', dot: 'bg-amber-500' },
  rose: { pill: 'bg-rose-500/10 text-rose-500', dot: 'bg-rose-500' },
  emerald: { pill: 'bg-emerald-500/10 text-emerald-500', dot: 'bg-emerald-500' },
};

// Monthly-equivalent of recurring expenses (monthly as-is, yearly ÷12).
function monthlyOutflow(streams: MoneyStream[]): number {
  return streams
    .filter((s) => s.is_recurring && s.stream_type === 'expense')
    .reduce((sum, s) => {
      const a = parseFloat(s.amount);
      return sum + (s.frequency === 'monthly' ? a : s.frequency === 'yearly' ? a / 12 : 0);
    }, 0);
}

// A timeline row. Overdue items are tinted rose; far-out items are dimmed.
// Assigned members appear as a compact avatar stack before the urgency pill.
function EventRow({
  evt,
  days,
  tone,
  members,
  locale,
}: {
  evt: HouseholdEvent;
  days: number;
  tone: 'overdue' | 'week' | 'later';
  members: AssignmentDetail[];
  locale: string;
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
        {formatRelativeDay(days, locale)}
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
  const { currency, locale, timezone } = usePreferences();
  const { t } = useTranslation();

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

  // Bucket open events by urgency. "Needs attention" is actionable-only, so
  // income (money arriving — nothing to do) is excluded; it stays on the Timeline.
  const dated = events
    .filter((evt) => evt.event_type !== 'income')
    .map((evt) => ({ evt, days: daysUntil(evt.target_date, timezone) }))
    .sort((a, b) => a.days - b.days);
  const overdue = dated.filter((d) => d.days < 0);
  const thisWeek = dated.filter((d) => d.days >= 0 && d.days <= 7);
  const later = dated.filter((d) => d.days > 7);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t('overview.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">{t('overview.title')}</h1>
      </header>

      {/* First-run setup checklist — hides once the household is set up. */}
      {!loading && !error && !onboardingComplete && (
        <OnboardingCard
          usersCount={usersCount}
          streamsCount={streams.length}
          eventsCount={eventsTotal}
        />
      )}

      {/* Quick stats — outflow gets a full-width row so long localized
          currency strings (e.g. "14.777,84 kr.") never overflow; the two
          counts share the row below. */}
      <div className="space-y-3">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">{t('overview.monthlyOutflow')}</p>
          <p className="mt-1 text-2xl font-light tabular-nums text-emerald-500">
            {loading ? '—' : formatMoney(monthlyOutflow(streams), currency, locale)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">{t('overview.overdue')}</p>
            <p className="mt-1 text-xl font-light text-rose-500">
              {loading ? '—' : overdue.length}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
            <p className="text-xs text-zinc-500">{t('overview.thisWeek')}</p>
            <p className="mt-1 text-xl font-light text-amber-500">
              {loading ? '—' : thisWeek.length}
            </p>
          </div>
        </div>
      </div>

      {/* Attention list */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
          {t('overview.needsAttention')}
        </p>

        {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
        {error && <p className="text-sm text-rose-400">{error}</p>}
        {!loading && !error && dated.length === 0 && (
          <p className="text-sm text-zinc-500">{t('overview.allClear')}</p>
        )}

        {!loading && !error && dated.length > 0 && (
          <div className="space-y-5">
            {overdue.length > 0 && (
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-rose-500/80">
                  {t('overview.overdue')}
                </p>
                <ul className="space-y-3">
                  {overdue.map(({ evt, days }) => (
                    <EventRow key={evt.id} evt={evt} days={days} tone="overdue" members={membersByEvent.get(evt.id) ?? []} locale={locale} />
                  ))}
                </ul>
              </div>
            )}
            {thisWeek.length > 0 && (
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-500">
                  {t('overview.thisWeek')}
                </p>
                <ul className="space-y-3">
                  {thisWeek.map(({ evt, days }) => (
                    <EventRow key={evt.id} evt={evt} days={days} tone="week" members={membersByEvent.get(evt.id) ?? []} locale={locale} />
                  ))}
                </ul>
              </div>
            )}
            {later.length > 0 && (
              <div>
                <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-widest text-zinc-600">
                  {t('overview.later')}
                </p>
                <ul className="space-y-3">
                  {later.map(({ evt, days }) => (
                    <EventRow key={evt.id} evt={evt} days={days} tone="later" members={membersByEvent.get(evt.id) ?? []} locale={locale} />
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
