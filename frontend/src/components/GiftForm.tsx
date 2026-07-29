import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { CURRENCIES } from '../lib/countries';
import type { GiftItem, GiftStatus, LinkPreview } from '../lib/types';
import { LinkField } from './LinkField';

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

interface GiftFormProps {
  /** Which list a new item is added to. Ignored when editing. */
  listId: number;
  /** True when the viewer owns the target list — hides the status control
   * entirely, since the backend rejects a status change there outright. */
  isOwnList: boolean;
  initial?: GiftItem;
  onSaved: (gift: GiftItem) => void;
  onCancel: () => void;
  onDeleted?: (id: number) => void;
}

export function GiftForm({ listId, isOwnList, initial, onSaved, onCancel, onDeleted }: GiftFormProps) {
  const { t } = useTranslation();
  const { currency: defaultCurrency } = usePreferences();
  const isEdit = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [linkTitle, setLinkTitle] = useState<string | null>(initial?.link_title ?? null);
  const [linkSite, setLinkSite] = useState<string | null>(initial?.link_site ?? null);
  const [price, setPrice] = useState(initial?.price ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [status, setStatus] = useState<GiftStatus>(initial?.status ?? 'idea');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const onParsed = (meta: LinkPreview) => {
    setLinkTitle(meta.title);
    setLinkSite(meta.site);
    // A parsed page title fills an empty gift title — never overwrites one.
    if (meta.title && !title.trim()) setTitle(meta.title.slice(0, 160));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(t('gifts.errTitle'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      title: title.trim(),
      url: url.trim() || null,
      link_title: url.trim() ? linkTitle : null,
      link_site: url.trim() ? linkSite : null,
      price: price !== '' && !Number.isNaN(parseFloat(String(price))) ? parseFloat(String(price)) : null,
      currency,
      ...(isEdit && !isOwnList ? { status } : {}),
    };
    try {
      const saved = isEdit
        ? await api.patch<GiftItem>(`/gift-lists/items/${initial!.id}`, body)
        : await api.post<GiftItem>(`/gift-lists/${listId}/items`, body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('gifts.errSave'));
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDeleted) return;
    setSubmitting(true);
    try {
      await api.delete(`/gift-lists/items/${initial.id}`);
      onDeleted(initial.id);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="gift_title" className={labelCls}>{t('form.title')}</label>
        <input
          id="gift_title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('gifts.titlePlaceholder')}
          maxLength={160}
          className={fieldCls}
        />
      </div>

      <LinkField
        id="gift_url"
        url={url}
        onChange={setUrl}
        onParsed={onParsed}
        parsedTitle={linkTitle}
        parsedSite={linkSite}
      />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="gift_price" className={labelCls}>{t('form.amount')}</label>
          <input
            id="gift_price"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="gift_currency" className={labelCls}>{t('form.currency')}</label>
          <select id="gift_currency" value={currency ?? defaultCurrency} onChange={(e) => setCurrency(e.target.value)} className={fieldCls}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* The owner never sees a status control at all — not even a disabled
          one — since the backend rejects the change outright either way. */}
      {isEdit && !isOwnList && (
        <div>
          <span className={labelCls}>{t('gifts.status')}</span>
          <div className="grid grid-cols-3 gap-2">
            {(['idea', 'reserved', 'bought'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                aria-pressed={status === s}
                className={[
                  'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                  status === s
                    ? s === 'bought'
                      ? 'border-teal-500/40 bg-teal-500/15 text-teal-300'
                      : s === 'reserved'
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                        : 'border-zinc-500/40 bg-zinc-700/40 text-zinc-100'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
                ].join(' ')}
              >
                {t(`gifts.status_${s}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex gap-3 pt-1">
        {isEdit && onDeleted && (
          <button
            type="button"
            onClick={() => (confirmDelete ? handleDelete() : setConfirmDelete(true))}
            disabled={submitting}
            className={[
              'rounded-xl border px-3 py-2.5 text-sm transition-colors',
              confirmDelete ? 'border-rose-500/40 text-rose-400' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
            ].join(' ')}
          >
            {confirmDelete ? t('common.confirm') : t('form.deleteGift')}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? t('common.saving') : isEdit ? t('common.save') : t('gifts.addGift')}
        </button>
      </div>
    </form>
  );
}
