import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface Step {
  label: string;
  hint: string;
  done: boolean;
  to: string;
}

// A calm first-run checklist shown on the Overview until the household is set
// up. Each step deep-links to the tab where the relevant form lives. The card
// hides itself once every step is complete (see `allDone` in Overview).
export function OnboardingCard({
  usersCount,
  streamsCount,
  eventsCount,
}: {
  usersCount: number;
  streamsCount: number;
  eventsCount: number;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const steps: Step[] = [
    {
      label: t('onboarding.addMembers'),
      hint: t('onboarding.addMembersHint'),
      done: usersCount > 1,
      to: '/household',
    },
    {
      label: t('onboarding.addMoney'),
      hint: t('onboarding.addMoneyHint'),
      done: streamsCount > 0,
      to: '/money',
    },
    {
      label: t('onboarding.addEvent'),
      hint: t('onboarding.addEventHint'),
      done: eventsCount > 0,
      to: '/timeline',
    },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
          {t('onboarding.title')}
        </p>
        <p className="text-xs text-zinc-600">{t('onboarding.left', { count: remaining })}</p>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-zinc-400">
        {t('onboarding.intro')}
      </p>
      <ul className="space-y-2">
        {steps.map((s) => (
          <li key={s.to}>
            <button
              type="button"
              onClick={() => navigate(s.to)}
              className="flex w-full items-center gap-3 rounded-xl border border-zinc-800/60 px-3 py-2.5 text-left transition-colors hover:border-zinc-700"
            >
              {/* Status check */}
              <span
                className={[
                  'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  s.done ? 'border-emerald-500 bg-emerald-500' : 'border-zinc-600',
                ].join(' ')}
              >
                {s.done && (
                  <svg className="h-3 w-3 text-zinc-900" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M10 3L5 8.5 2 5.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm ${s.done ? 'text-zinc-500 line-through' : 'text-zinc-200'}`}>
                  {s.label}
                </span>
                {!s.done && <span className="block text-xs text-zinc-500">{s.hint}</span>}
              </span>
              {!s.done && (
                <svg className="h-4 w-4 flex-shrink-0 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
