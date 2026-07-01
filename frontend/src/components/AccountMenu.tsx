import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from './Avatar';
import { useAuth } from '../lib/auth';
import { usePreferences, applyTheme, type Theme } from '../lib/preferences';
import type { User } from '../lib/types';

interface AccountMenuProps {
  user: User;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}

// Right-aligned account control: avatar + name that opens a small popover menu
// for Settings, a quick appearance toggle, and sign out. Closes on outside
// click, Escape, or item selection.
export function AccountMenu({ user, onOpenAccount, onOpenSettings }: AccountMenuProps) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const prefs = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
        theme,
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-zinc-800/60"
      >
        <Avatar name={user.name} url={user.avatar_url} size="md" />
        <span className="max-w-[8rem] truncate text-sm font-light text-zinc-300">{user.name}</span>
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
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
            className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900 shadow-2xl"
          >
            {/* Identity line — the avatar already lives on the trigger. */}
            <div className="border-b border-zinc-800/60 px-4 py-3">
              <p className="truncate text-sm text-zinc-100">{user.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                家庭{user.role === 'admin' ? ` · ${t('household.admin')}` : ''}
              </p>
            </div>

            <div className="p-1.5">
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
  );
}
