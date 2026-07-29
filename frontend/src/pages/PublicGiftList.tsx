import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { GiftItem, GiftStatus } from '../lib/types';
import { DomainChip } from '../components/LinkField';

interface PublicGiftListResponse {
  list_name: string;
  // The household's money-formatting locale, sent by the server since an
  // anonymous visitor has no session to fetch preferences with.
  locale: string;
  items: GiftItem[];
}

const NAME_KEY = 'katei-gift-share-name';

const fieldCls =
  'w-full max-w-xs rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

// A share-link visitor's view of one wishlist — no session, no app chrome.
// Marking an item is anonymous: nothing here ever reaches the list's owner.
export default function PublicGiftList() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<PublicGiftListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [visitorName, setVisitorName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
  });

  useEffect(() => {
    if (!token) return;
    api.get<PublicGiftListResponse>(`/gift-share/${token}`)
      .then(setData)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const saveName = (name: string) => {
    setVisitorName(name);
    try { localStorage.setItem(NAME_KEY, name); } catch { /* private mode */ }
  };

  const mark = async (item: GiftItem, status: GiftStatus) => {
    if (!token) return;
    try {
      const updated = await api.patch<GiftItem>(`/gift-share/${token}/items/${item.id}`, {
        status, bought_by_note: visitorName.trim() || null,
      });
      setData((prev) => prev && { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) });
    } catch { /* leave state as-is; the button remains tappable */ }
  };

  return (
    <div className="min-h-full bg-zinc-950 px-4 py-10">
      <div className="mx-auto max-w-lg space-y-6">
        <header>
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('lists.gifts')}</p>
          <h1 className="mt-1 text-2xl font-light text-zinc-100">
            {data ? t('gifts.publicTitle', { name: data.list_name }) : t('lists.gifts')}
          </h1>
        </header>

        {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
        {notFound && <p className="text-sm text-rose-400">{t('gifts.publicNotFound')}</p>}

        {!loading && !notFound && data && (
          <>
            <div>
              <label htmlFor="visitor_name" className="mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500">
                {t('gifts.yourNameOptional')}
              </label>
              <input
                id="visitor_name"
                type="text"
                value={visitorName}
                onChange={(e) => saveName(e.target.value)}
                maxLength={60}
                className={fieldCls}
              />
            </div>

            {data.items.length === 0 ? (
              <p className="text-sm text-zinc-500">{t('gifts.publicEmpty')}</p>
            ) : (
              <div className="divide-y divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
                {data.items.map((g) => (
                  <div key={g.id} className="space-y-2 p-4">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${g.status === 'bought' ? 'text-zinc-400' : 'text-zinc-100'}`}>{g.title}</p>
                        {g.price != null && (
                          <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                            {formatMoney(g.price, g.currency ?? 'EUR', data.locale)}
                          </p>
                        )}
                      </div>
                      {g.url && <DomainChip url={g.url} site={g.link_site} />}
                    </div>

                    {g.status !== 'idea' && (
                      <p className="text-xs text-teal-400">
                        {t(g.status === 'bought' ? 'gifts.boughtBy' : 'gifts.reservedBy', { name: g.bought_by_name ?? t('gifts.someone') })}
                      </p>
                    )}

                    <div className="flex gap-2">
                      {g.status === 'idea' && (
                        <>
                          <button
                            type="button"
                            onClick={() => mark(g, 'reserved')}
                            className="rounded-xl border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700"
                          >
                            {t('gifts.markReserved')}
                          </button>
                          <button
                            type="button"
                            onClick={() => mark(g, 'bought')}
                            className="rounded-xl border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-zinc-700"
                          >
                            {t('gifts.markBought')}
                          </button>
                        </>
                      )}
                      {g.status !== 'idea' && (
                        <button
                          type="button"
                          onClick={() => mark(g, 'idea')}
                          className="text-xs text-zinc-500 underline-offset-2 transition-colors hover:text-zinc-300"
                        >
                          {t('gifts.markUndo')}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
