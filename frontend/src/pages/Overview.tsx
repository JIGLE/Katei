import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { AssigneeStack } from '../components/Avatar';
import { OnboardingCard } from '../components/OnboardingCard';
import { WeekStrip } from '../components/WeekStrip';
import { DOT } from '../components/CalendarMonth';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { useAuth } from '../lib/auth';
import { daysUntil, formatRelativeDay, formatRelativeTime, daysToBirthday } from '../lib/format';
import type {
  Activity, AssignmentDetail, GiftListsResponse, HouseholdEvent, MoneyStream, ShoppingItem, User,
} from '../lib/types';

// Thin line icons for the two shortcuts, in the bottom nav's idiom.
const ICON_BAG = 'M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007z';
const ICON_GIFT = 'M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z';

// One shortcut into a list: what it is, and how much is waiting there.
function QuickTile({
  iconPath, label, detail, onClick,
}: {
  iconPath: string;
  label: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 p-4 text-left transition-colors hover:bg-zinc-800/30"
    >
      <svg aria-hidden className="h-5 w-5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
      </svg>
      <span className="text-sm text-zinc-200">{label}</span>
      <span className="text-xs text-zinc-500">{detail}</span>
    </button>
  );
}

// A dated row in "Next payments" / "Upcoming appointments": what and when,
// never how much. Overdue reads rose so dropping the old attention list
// doesn't let a missed obligation disappear quietly.
function UpcomingRow({
  evt, days, dot, members, lang, onSelect,
}: {
  evt: HouseholdEvent;
  days: number;
  dot: string;
  members: AssignmentDetail[];
  lang: string;
  onSelect: () => void;
}) {
  const overdue = days < 0;
  return (
    <li>
      <button type="button" onClick={onSelect} className="flex w-full items-center gap-3 text-left">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${overdue ? 'bg-rose-500' : dot}`} />
        <span className={`min-w-0 flex-1 truncate text-sm ${overdue ? 'text-rose-300' : 'text-zinc-200'}`}>
          {evt.title}
        </span>
        <AssigneeStack members={members} size="xs" />
        <span
          className={[
            'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            overdue ? 'bg-rose-500/20 text-rose-400' : 'bg-zinc-800 text-zinc-400',
          ].join(' ')}
        >
          {formatRelativeDay(days, lang)}
        </span>
      </button>
    </li>
  );
}

// Around the house shows a glance at money/event activity only — no who,
// just what and when. member_added and shopping_added stay in the log (still
// auditable in storage) but never render here.
const MONEY_EVENT_ACTIONS = new Set<Activity['action']>([
  'stream_added', 'event_added', 'event_done', 'payment_paid', 'savings_added',
]);
// With money off, the glance drops every money-flavored verb too — a
// note-less savings contribution's summary is a bare number (see savings.ts),
// which is exactly the kind of thing "never encounters a money concept
// anywhere" is meant to cover.
const NON_MONEY_EVENT_ACTIONS = new Set<Activity['action']>(['event_added', 'event_done']);

// How many dated rows each block shows before deferring to the Timeline.
const ROW_CAP = 4;

export default function Overview() {
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [gifts, setGifts] = useState<GiftListsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { timezone, household_name, money_enabled } = usePreferences();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const fetchAll = () => {
    Promise.all([
      api.get<HouseholdEvent[]>('/events'),
      api.get<MoneyStream[]>('/money-streams'),
      api.get<AssignmentDetail[]>('/assignments'),
      api.get<User[]>('/users'),
      api.get<Activity[]>('/activity?limit=20'),
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
    // The two lists are soft, non-blocking glances — they only feed the
    // shortcut counts, so a failure should never blank the dashboard.
    api.get<ShoppingItem[]>('/shopping').then(setShopping).catch(() => {});
    api.get<GiftListsResponse>('/gift-lists').then(setGifts).catch(() => {});
  };

  useEffect(() => {
    fetchAll();
    // A resumed PWA lands on yesterday's dashboard otherwise — refresh
    // quietly whenever the app comes back into view.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The first-run checklist can also be put away — a one-person household
  // can never tick "add members", so completion alone can't retire it.
  const [onboardingHidden, setOnboardingHidden] = useState(
    () => localStorage.getItem('katei-onboarding-hidden') === '1',
  );
  const hideOnboarding = () => {
    setOnboardingHidden(true);
    try { localStorage.setItem('katei-onboarding-hidden', '1'); } catch { /* private mode */ }
  };

  const usersCount = members.length;

  // Upcoming birthdays (people & pets) within the next month, soonest first —
  // the warm, human reason to open the app even when nothing is due.
  const birthdays = members
    .map((m) => ({ member: m, days: daysToBirthday(m.birthday) }))
    .filter((b): b is { member: User; days: number } => b.days !== null && b.days <= 30)
    .sort((a, b) => a.days - b.days);

  // Show the first-run checklist until every setup step is satisfied. With
  // money off, OnboardingCard drops its own money step, so completion here
  // must stop requiring one too — otherwise a money-disabled household could
  // never satisfy streams.length > 0 and the card would never auto-hide.
  const onboardingComplete = usersCount > 1 && eventsTotal > 0 && (!money_enabled || streams.length > 0);

  // Index assignments by event so an appointment can show who it's for.
  const membersByEvent = new Map<number, AssignmentDetail[]>();
  for (const a of assignments) {
    if (a.event_id == null) continue;
    const list = membersByEvent.get(a.event_id) ?? [];
    list.push(a);
    membersByEvent.set(a.event_id, list);
  }

  const dated = events
    .map((evt) => ({ evt, days: daysUntil(evt.target_date, timezone) }))
    .sort((a, b) => a.days - b.days);

  // What's about to leave the account: payments and savings transfers, dated
  // only. Income is excluded — money arriving doesn't answer "have I got
  // enough in there". Amounts deliberately never appear here.
  const payments = dated.filter(
    ({ evt }) => evt.event_type === 'payment' || evt.event_type === 'savings',
  );
  const appointments = dated.filter(({ evt }) => evt.event_type === 'appointment');

  // Open shopping items, and gift ideas on other people's lists that nobody
  // has claimed yet — the two "something is waiting for you" counts.
  const shoppingOpen = shopping.filter((i) => !i.is_done).length;
  const giftIdeas = (gifts?.others ?? []).reduce(
    (n, l) => n + l.items.filter((g) => g.status === 'idea').length,
    0,
  );

  // The five rows Around the house actually shows — money/event verbs only,
  // narrowed further to non-money verbs when money is off.
  const glanceActions = money_enabled ? MONEY_EVENT_ACTIONS : NON_MONEY_EVENT_ACTIONS;
  const glanceActivity = activity.filter((a) => glanceActions.has(a.action)).slice(0, 5);

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
  // The one-line TLDR of the home: count overdue AND the week, not just the
  // worst bucket — "1 overdue · 2 due this week". It counts deadlines too,
  // which have no block of their own here, so the line taps through to the
  // Timeline — a number you can't drill into is a number you can't trust.
  const actionable = dated.filter(({ evt }) => evt.event_type !== 'income');
  const statusParts = [
    ...(actionable.some((d) => d.days < 0)
      ? [t('overview.statusOverdue', { count: actionable.filter((d) => d.days < 0).length })]
      : []),
    ...(actionable.some((d) => d.days >= 0 && d.days <= 7)
      ? [t('overview.statusWeek', { count: actionable.filter((d) => d.days >= 0 && d.days <= 7).length })]
      : []),
  ];
  const summary = loading ? null : statusParts.length ? statusParts.join(' · ') : t('overview.summaryClear');

  // A gentle staggered entrance: each block rises in just after the one above.
  // reveal() runs in render order, only for rendered blocks, so conditional
  // sections never leave timing holes. The class fills `backwards` and is
  // disabled under prefers-reduced-motion, so this is safe and calm.
  let step = 0;
  const reveal = () => ({ animationDelay: `${step++ * 50}ms` });

  // Both dated blocks render identically apart from their accent and where a
  // tap lands, so they share one renderer.
  const datedSection = (
    labelKey: string,
    rows: { evt: HouseholdEvent; days: number }[],
    dot: string,
    onSelect: (d: { evt: HouseholdEvent; days: number }) => void,
  ) => {
    if (loading || error || rows.length === 0) return null;
    const shown = rows.slice(0, ROW_CAP);
    const extra = rows.length - shown.length;
    return (
      <section className="animate-fade-slide-in rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5" style={reveal()}>
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">{t(labelKey)}</p>
        <ul className="space-y-3">
          {shown.map((d) => (
            <UpcomingRow
              key={d.evt.id}
              evt={d.evt}
              days={d.days}
              dot={dot}
              members={membersByEvent.get(d.evt.id) ?? []}
              lang={lang}
              onSelect={() => onSelect(d)}
            />
          ))}
        </ul>
        {extra > 0 && (
          <button
            type="button"
            onClick={() => navigate('/timeline')}
            className="mt-3 text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
          >
            {t('overview.more', { count: extra })}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="space-y-6">
      <header className="animate-fade-slide-in" style={reveal()}>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">{title}</h1>
        {summary && (statusParts.length > 0 ? (
          <button
            type="button"
            onClick={() => navigate('/timeline')}
            className="mt-2 text-sm text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-200 hover:underline"
          >
            {summary}
          </button>
        ) : (
          <p className="mt-2 text-sm text-zinc-400">{summary}</p>
        ))}
      </header>

      {/* Week strip — a tap-through gateway to the calendar, in the calendar's
          own visual language (event dots by type, today ringed). */}
      {!loading && !error && (
        <div className="animate-fade-slide-in" style={reveal()}>
          <WeekStrip
            events={events}
            lang={lang}
            timezone={timezone}
            onSelectDay={(day) => navigate(`/timeline?day=${day}`)}
          />
        </div>
      )}

      {/* First-run setup checklist — hides once the household is set up, or
          when it's put away (a solo home can never tick "add members"). */}
      {!loading && !error && !onboardingComplete && !onboardingHidden && (
        <div className="animate-fade-slide-in" style={reveal()}>
          <OnboardingCard
            usersCount={usersCount}
            streamsCount={streams.length}
            eventsCount={eventsTotal}
            moneyEnabled={money_enabled}
            onDismiss={hideOnboarding}
          />
        </div>
      )}

      {/* The two lists people reach for daily. Always here — a shortcut that
          comes and goes isn't a shortcut. Icons stay neutral so the accents
          below carry the meaning. */}
      {!loading && !error && (
        <div
          className="animate-fade-slide-in grid grid-cols-2 divide-x divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900"
          style={reveal()}
        >
          <QuickTile
            iconPath={ICON_BAG}
            label={t('overview.shoppingList')}
            detail={shoppingOpen > 0 ? t('overview.toGet', { count: shoppingOpen }) : t('overview.shoppingClear')}
            onClick={() => navigate('/lists')}
          />
          <QuickTile
            iconPath={ICON_GIFT}
            label={t('lists.gifts')}
            detail={giftIdeas > 0 ? t('overview.giftIdeas', { count: giftIdeas }) : t('overview.giftsNone')}
            onClick={() => navigate('/lists?pane=gifts')}
          />
        </div>
      )}

      {/* What's leaving the account soon — dates, never amounts. Tapping a row
          opens the Timeline, where it can be marked paid. Gone entirely when
          money is off — there's no "leaving the account" to speak of. */}
      {money_enabled && datedSection('overview.nextPayments', payments, DOT.payment, () => navigate('/timeline'))}

      {/* Where the household has to be. Tapping opens that day in the calendar. */}
      {datedSection('overview.upcomingAppointments', appointments, DOT.appointment, ({ evt }) =>
        navigate(`/timeline?day=${evt.target_date.slice(0, 10)}`))}

      {/* Upcoming birthdays — a warm nudge for the people (and pets) at home. */}
      {!loading && birthdays.length > 0 && (
        <section className="animate-fade-slide-in rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5" style={reveal()}>
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

      {/* Around the house — a glance at recent money/event activity, no who.
          Five rows; the item is the news, so it wins the space (two lines if
          needed). Still fully auditable in storage — this section just
          doesn't render the actor, and a private stream's activity never
          appears here for anyone but its owner. */}
      {!loading && glanceActivity.length > 0 && (
        <section className="animate-fade-slide-in rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5" style={reveal()}>
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
            {t('overview.activity')}
          </p>
          <ul className="space-y-3">
            {glanceActivity.map((a) => (
              <li key={a.id} className="flex items-center gap-3">
                <span className="line-clamp-2 flex-1 text-sm text-zinc-300">
                  {t(`activity.${a.action}_plain`, { item: a.summary })}
                </span>
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
