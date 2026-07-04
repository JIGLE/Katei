import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { formatMoney } from '../lib/format';
import type { GiftItem, GiftList, User } from '../lib/types';
import { Modal } from './Modal';
import { EmptyState } from './EmptyState';
import { GiftForm } from './GiftForm';
import { DomainChip } from './LinkField';
import { Avatar } from './Avatar';

// The gifts half of the Lists tab. What the server hides stays hidden — the
// pane only says how many of the household's gifts are being kept from you.
export function GiftsPane() {
  const { t } = useTranslation();
  const { locale } = usePreferences();
  const [data, setData] = useState<GiftList | null>(null);
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GiftItem | null>(null);

  const fetchGifts = () => {
    api.get<GiftList>('/gifts')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    fetchGifts();
    api.get<User[]>('/users').then(setMembers).catch(() => {});
  }, []);

  const handleSaved = () => { setShowForm(false); setEditing(null); fetchGifts(); };

  const items = data?.items ?? [];
  // Grouped by recipient, in the server's name order.
  const groups = items.reduce<Map<number, GiftItem[]>>((map, g) => {
    map.set(g.recipient_id, [...(map.get(g.recipient_id) ?? []), g]);
    return map;
  }, new Map());

  return (
    <div className="animate-fade-slide-in space-y-4">
      {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <EmptyState icon="🎁" title={t('gifts.empty')} hint={t('gifts.emptyHint')} actionLabel={t('gifts.addGift')} onAction={() => setShowForm(true)} />
      )}

      {!loading && !error && [...groups.entries()].map(([recipientId, gifts]) => {
        const first = gifts[0];
        return (
          <section key={recipientId} className="space-y-2">
            <div className="flex items-center gap-2">
              <Avatar name={first.recipient_name} url={first.recipient_avatar} size="sm" />
              <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">
                {t('gifts.forName', { name: first.recipient_name })}
              </p>
            </div>
            <div className="divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
              {/* The domain chip is a link, so it sits beside (not inside)
                  the row's edit button — nested interactives are invalid. */}
              {gifts.map((g) => (
                <div key={g.id} className="flex items-center gap-3 p-4 transition-colors hover:bg-zinc-800/30">
                  <button type="button" onClick={() => setEditing(g)} className="min-w-0 flex-1 text-left">
                    <p className={`text-sm ${g.status === 'bought' ? 'text-zinc-400' : 'text-zinc-100'}`}>{g.title}</p>
                    {g.price != null && (
                      <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                        {formatMoney(g.price, g.currency ?? 'EUR', locale)}
                      </p>
                    )}
                  </button>
                  {g.url && <DomainChip url={g.url} site={g.link_site} />}
                  <span
                    className={[
                      'flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                      g.status === 'bought' ? 'bg-teal-500/10 text-teal-300' : 'bg-zinc-800 text-zinc-500',
                    ].join(' ')}
                  >
                    {t(`gifts.status_${g.status}`)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {!loading && !error && (data?.hidden_for_you ?? 0) > 0 && (
        <p className="text-center text-xs text-zinc-600">
          {t('gifts.hiddenForYou', { count: data!.hidden_for_you })}
        </p>
      )}

      {/* Floating add button — matches the Timeline/Money pattern. */}
      <button
        onClick={() => setShowForm(true)}
        aria-label={t('gifts.addGiftAria')}
        className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <Modal open={showForm} title={t('gifts.newGift')} onClose={() => setShowForm(false)}>
        <GiftForm members={members} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!editing} title={t('gifts.editGift')} onClose={() => setEditing(null)}>
        {editing && (
          <GiftForm members={members} initial={editing} onSaved={handleSaved} onCancel={() => setEditing(null)} onDeleted={handleSaved} />
        )}
      </Modal>
    </div>
  );
}
