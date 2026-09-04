import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { useAuth } from '../lib/auth';
import { AccountMenu } from './AccountMenu';

const tabs = [
  {
    to: '/',
    labelKey: 'nav.overview',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
    accent: null,
  },
  {
    to: '/timeline',
    labelKey: 'nav.timeline',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
    accent: 'amber' as const,
  },
  {
    to: '/money',
    labelKey: 'nav.money',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
    accent: 'emerald' as const,
  },
  {
    to: '/lists',
    labelKey: 'nav.lists',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
    accent: 'teal' as const,
  },
  {
    to: '/household',
    labelKey: 'nav.household',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round"
          d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    accent: null,
  },
];

const accentColor = {
  amber: 'bg-amber-500',
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-400',
};

interface BottomNavProps {
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}

export function BottomNav({ onOpenAccount, onOpenSettings }: BottomNavProps) {
  const { t } = useTranslation();
  const { money_enabled } = usePreferences();
  const { user } = useAuth();
  const visibleTabs = money_enabled ? tabs : tabs.filter((tab) => tab.to !== '/money');
  if (!user) return null; // BottomNav only ever renders once a session exists
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pb-safe">
      <div className="flex items-center justify-center px-3 pb-4">
        <div className="flex items-center gap-0.5 rounded-full border border-zinc-800/60 bg-zinc-900/95 px-2 py-1.5 shadow-2xl backdrop-blur-sm">
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                [
                  'relative flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.7rem] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-300',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {tab.icon}
                  <span className="whitespace-nowrap">{t(tab.labelKey)}</span>
                  {tab.accent && isActive && (
                    <span
                      className={`absolute top-1.5 right-2 h-1 w-1 rounded-full ${accentColor[tab.accent]}`}
                    />
                  )}
                </>
              )}
            </NavLink>
          ))}
          {/* Divider marks the account control as a different kind of thing
              from the route tabs — a menu of actions, not a 6th destination —
              while staying inside the same continuous rounded-full shape. */}
          <span aria-hidden className="my-1 w-px flex-shrink-0 bg-zinc-600" />
          <AccountMenu user={user} onOpenAccount={onOpenAccount} onOpenSettings={onOpenSettings} />
        </div>
      </div>
    </nav>
  );
}
