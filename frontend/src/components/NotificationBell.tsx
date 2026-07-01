import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatRelativeTime } from '../lib/format';
import { Modal } from './Modal';
import type { AppNotification } from '../lib/types';

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

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [feed, setFeed] = useState<Feed>({ items: [], unread: 0 });
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    api.get<Feed>('/notifications?limit=30').then(setFeed).catch(() => {});
  }, []);

  // Refresh on mount and whenever the route changes (a lightweight poll point
  // without a background timer — the bell reflects state each time you navigate).
  useEffect(() => { load(); }, [load, location.pathname]);

  const openFeed = () => {
    setOpen(true);
    if (feed.unread > 0) {
      // Optimistically clear the badge, then persist.
      setFeed((f) => ({ ...f, unread: 0 }));
      api.post('/notifications/read', {}).then(load).catch(() => {});
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openFeed}
        aria-label={t('notifications.title')}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
        </svg>
        {feed.unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.6rem] font-semibold text-white">
            {feed.unread > 9 ? '9+' : feed.unread}
          </span>
        )}
      </button>

      <Modal open={open} title={t('notifications.title')} onClose={() => setOpen(false)}>
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
