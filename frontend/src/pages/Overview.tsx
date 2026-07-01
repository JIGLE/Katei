import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AssigneeStack, Avatar } from '../components/Avatar';
import { OnboardingCard } from '../components/OnboardingCard';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { useAuth } from '../lib/auth';
import { formatMoney, daysUntil, formatRelativeDay, formatRelativeTime, daysToBirthday } from '../lib/format';
import type { Activity, AssignmentDetail, HouseholdEvent, MoneyStream, User } from '../lib/types';

type Accent = 'amber' | 'rose' | 'emerald' | 'teal';

const eventAccent: Record<HouseholdEvent['event_type'], Accent> = {
  deadline: 'rose',
  payment: 'emerald',
  appointment: 'amber',
  income: 'emerald',
  savings: 'teal',
};

const accentMap: Record<Accent, { pill: string; dot: string }> = {
  amber: { pill: 'bg-amber-500/10 text-amber-500', dot: 'bg-amber-500' },
  rose: { pill: 'bg-rose-500/10 text-rose-500', dot: 'bg-rose-500' },
  emerald: { pill: 'bg-emerald-500/10 text-emerald-500', dot: 'bg-emerald-500' },
  teal: { pill: 'bg-teal-500/10 text-teal-300', dot: 'bg-teal-400' },
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
  lang,
}: {
  evt: HouseholdEvent;
  days: number;
  tone: 'overdue' | 'week' | 'later';
  members: AssignmentDetail[];
  lang: string;
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
        {formatRelativeDay(days, lang)}
      </span>
    </li>
  );
}

// Turn an activity row into a localized sentence. The verb lives in the
// catalog; the actor + item are interpolated (item stays as stored).
function activitySentence(
  a: Activity,
  t: (k: string, o?: Record<string, unknown>) => string,
): string {
  const actor = a.actor_name ?? t('activity.someone');
  return t(`activity.${a.action}`, { actor, item: a.summary });
}

export default function Overview() {
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { currency, locale, timezone, household_name } = usePreferences();
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  useEffect(() => {
    Promise.all([
      api.get<HouseholdEvent[]>('/events'),
      api.get<MoneyStream[]>('/money-streams'),
      api.get<AssignmentDetail[]>('/assignments'),
      api.get<User[]>('/users'),
      api.get<Activity[]>('/activity?limit=8'),
    ])
      .then(([evts, strs, asgs, users, acts]) => {
        setEvents(evts.filter((e) => !e.is_completed));
        setEventsTotal(evts.length);
        setStreams(strs);
        setAssignments(asgs);
        setMembers(users);
        setActivity(acts);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const usersCount = members.length;

  // Upcoming birthdays (people & pets) within the next month, soonest first —
  // the warm, human reason to open the app even when nothing is due.
  const birthdays = members
    .map((m) => ({ member: m, days: daysToBirthday(m.birthday) }))
    .filter((b): b is { member: User; days: number } => b.days !== null && b.days <= 30)
    .sort((a, b) => a.days - b.days);

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

  // A warm, personal header that leads with the household identity: the home's
  // name is the eyebrow and a time-of-day greeting to the member is the title,
  // with a one-line status beneath. Falls back gracefully when no name is set.
  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'overview.morning' : hour < 18 ? 'overview.afternoon' : 'overview.evening';
  const greeting = t(greetKey);
  const eyebrow = household_name || greeting;
  const title = user?.name
    ? household_name
      ? t('overview.greetingName', { greeting, name: user.name })
      : user.name
    : t('overview.title');
  const summary = loading
    ? null
    : overdue.length > 0
      ? t('overview.summaryOverdue', { count: overdue.length })
      : thisWeek.length > 0
        ? t('overview.summaryWeek', { count: thisWeek.length })
        : t('overview.summaryClear');

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">{title}</h1>
        {summary && <p className="mt-2 text-sm text-zinc-400">{summary}</p>}
      </header>

      {/* First-run setup checklist — hides once the household is set up. */}
      {!loading && !error && !onboardingComplete && (
        <OnboardingCard
          usersCount={usersCount}
          streamsCount={streams.length}
          eventsCount={eventsTotal}
        />
      )}

      {/* At-a-glance strip — a quiet, unified summary (one panel split by
          dividers, matching the Money page) so the "Needs attention" list below
          is the focal point rather than spend. Outflow's non-breaking currency
          separator is normalized so long amounts wrap cleanly in the cell. */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
        <div className="p-4">
          <p className="text-xs text-zinc-500">{t('overview.overdue')}</p>
          <p className="mt-1 text-lg font-light tabular-nums text-rose-500">{loading ? '—' : overdue.length}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-zinc-500">{t('overview.thisWeek')}</p>
          <p className="mt-1 text-lg font-light tabular-nums text-amber-500">{loading ? '—' : thisWeek.length}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-zinc-500">{t('overview.monthlyOutflow')}</p>
          <p className="mt-1 text-sm font-light leading-tight tabular-nums text-emerald-500">
            {loading ? '—' : formatMoney(monthlyOutflow(streams), currency, locale).replace(/[  ]/g, ' ')}
          </p>
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
                    <EventRow key={evt.id} evt={evt} days={days} tone="overdue" members={membersByEvent.get(evt.id) ?? []} lang={lang} />
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
                    <EventRow key={evt.id} evt={evt} days={days} tone="week" members={membersByEvent.get(evt.id) ?? []} lang={lang} />
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
                    <EventRow key={evt.id} evt={evt} days={days} tone="later" members={membersByEvent.get(evt.id) ?? []} lang={lang} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Upcoming birthdays — a warm nudge for the people (and pets) at home. */}
      {!loading && birthdays.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
            {t('overview.birthdays')}
          </p>
          <ul className="space-y-3">
            {birthdays.map(({ member, days }) => (
              <li key={member.id} className="flex items-center gap-3">
                <span className="text-base leading-none" aria-hidden>🎂</span>
                <span className="flex-1 truncate text-sm text-zinc-200">{member.name}</span>
                <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-xs font-medium text-teal-400">
                  {days === 0 ? t('household.birthdayToday') : formatRelativeDay(days, lang)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Around the house — the shared pulse of recent activity. */}
      {!loading && activity.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
            {t('overview.activity')}
          </p>
          <ul className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <Avatar name={a.actor_name ?? '·'} url={a.actor_avatar} size="sm" />
                <span className="flex-1 truncate text-sm text-zinc-300">{activitySentence(a, t)}</span>
                <time className="flex-shrink-0 text-xs tabular-nums text-zinc-600">
                  {formatRelativeTime(a.created_at, lang)}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
