import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { api } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { useAuth } from '../lib/auth';
import { usePreferences, applyTheme, type Theme } from '../lib/preferences';
import type { User, AppNotification } from '../lib/types';

interface AccountMenuProps {
  user: User;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}

interface Feed {
  items: AppNotification[];
  unread: number;
}

// A small icon per notification type — a quiet visual anchor in the feed.
const TYPE_ICON: Record<string, string> = {
  reminder: '⏰',
  birthday: '🎂',
  assignment: '🧹',
};

// The nav's account control — the avatar itself, merged into the bottom nav
// pill (see BottomNav.tsx). Opens a popover for notifications, account,
// settings, appearance, and sign out; an unread-notification count shows as
// a badge on the avatar's corner. Closes on outside click, Escape, or item
// selection. Absorbs what used to be a separate header NotificationBell —
// there's no other unread-count logic anywhere else in the app to keep in
// sync with.
export function AccountMenu({ user, onOpenAccount, onOpenSettings }: AccountMenuProps) {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const { logout } = useAuth();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [feed, setFeed] = useState<Feed>({ items: [], unread: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.get<Feed>('/notifications?limit=30').then(setFeed).catch(() => {});
  }, []);

  // Refresh on mount and whenever the route changes (a lightweight poll point
  // without a background timer) — the badge must stay current even while the
  // popover itself is closed.
  useEffect(() => { load(); }, [load, location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const setTheme = (theme: Theme) => {
    if (theme === prefs.theme) return;
    applyTheme(theme); // instant feedback before the network round-trip
    prefs
      .save({
        country: prefs.country,
        currency: prefs.currency,
        locale: prefs.locale,
        timezone: prefs.timezone,
        language: prefs.language,
        savings_goal: prefs.savings_goal,
        savings_opening: prefs.savings_opening,
        theme,
        household_name: prefs.household_name,
        money_enabled: prefs.money_enabled,
      })
      .catch(() => {});
  };

  const openSettings = () => {
    setOpen(false);
    onOpenSettings();
  };

  const openAccount = () => {
    setOpen(false);
    onOpenAccount();
  };

  const openNotifications = () => {
    setOpen(false);
    setFeedOpen(true);
    if (feed.unread > 0) {
      // Optimistically clear the badge, then persist.
      setFeed((f) => ({ ...f, unread: 0 }));
      api.post('/notifications/read', {}).then(load).catch(() => {});
    }
  };

  const unread = feed.unread;

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={unread > 0 ? t('account.menuAriaUnread', { count: unread }) : t('account.menuAria')}
          className="relative flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-zinc-800/60"
        >
          {/* md, not lg: against the nav's 24px icons a 44px avatar reads as
              nearly double their weight and pulls the eye off the tabs. */}
          <Avatar name={user.name} url={user.avatar_url} size="md" />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.6rem] font-semibold text-white ring-2 ring-zinc-900"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>

        {open && (
          <>
            {/* Backdrop catches outside clicks */}
            <button
              aria-label={t('common.close')}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
              tabIndex={-1}
            />
            <div
              role="menu"
              className="absolute right-0 bottom-full z-50 mb-2 w-56 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900 shadow-2xl"
            >
              {/* Identity line — the avatar already lives on the trigger. Shows
                  the household's chosen name (Katei if unnamed) + the member role. */}
              <div className="border-b border-zinc-800/60 px-4 py-3">
                <p className="truncate text-sm text-zinc-100">{user.name}</p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {prefs.household_name || 'Katei'}
                  {user.role === 'admin' ? ` · ${t('household.admin')}` : ''}
                </p>
              </div>

              <div className="p-1.5">
                <button
                  role="menuitem"
                  onClick={openNotifications}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60"
                >
                  <svg className="h-4 w-4 flex-shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
                  </svg>
                  <span className="flex-1 text-left">{t('notifications.title')}</span>
                  {unread > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.65rem] font-semibold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>

                <button
                  role="menuitem"
                  onClick={openAccount}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60"
                >
                  <svg className="h-4 w-4 flex-shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                  {t('account.title')}
                </button>

                <button
                  role="menuitem"
                  onClick={openSettings}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60"
                >
                  <svg className="h-4 w-4 flex-shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.241.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.991l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {t('common.settings')}
                </button>

                {/* Appearance — glyph mirrors the current mode; slim toggle sets it. */}
                <div className="flex items-center justify-between rounded-xl px-2.5 py-2">
                  <span className="flex items-center gap-3 text-sm text-zinc-300">
                    <svg className="h-4 w-4 flex-shrink-0 text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      {prefs.theme === 'dark' ? (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                      )}
                    </svg>
                    {t('settings.theme')}
                  </span>
                  <div className="flex items-center gap-0.5 rounded-full border border-zinc-800 p-0.5">
                    {(['dark', 'light'] as Theme[]).map((opt) => (
                      <button
                        key={opt}
                        role="menuitemradio"
                        aria-checked={prefs.theme === opt}
                        aria-label={t(`settings.theme_${opt}`)}
                        onClick={() => setTheme(opt)}
                        className={[
                          'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                          prefs.theme === opt ? 'bg-zinc-800 text-emerald-400' : 'text-zinc-500 hover:text-zinc-300',
                        ].join(' ')}
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                          {opt === 'dark' ? (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                          ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                          )}
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-800/60 p-1.5">
                <button
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10"
                >
                  <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                  </svg>
                  {t('common.signOut')}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={feedOpen} title={t('notifications.title')} onClose={() => setFeedOpen(false)}>
        {feed.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-500">{t('notifications.empty')}</p>
        ) : (
          <ul className="space-y-3">
            {feed.items.map((n) => (
              <li key={n.id} className="flex items-start gap-3">
                <span className="mt-0.5 text-base leading-none" aria-hidden>{TYPE_ICON[n.type] ?? '•'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-zinc-100">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-zinc-500">{n.body}</p>}
                </div>
                <time className="flex-shrink-0 text-xs tabular-nums text-zinc-600">
                  {formatRelativeTime(n.created_at, i18n.language)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
