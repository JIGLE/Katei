import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { CURRENCIES } from '../lib/countries';
import type { GiftItem, User, LinkPreview } from '../lib/types';
import { LinkField } from './LinkField';

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600';

interface GiftFormProps {
  members: User[];
  initial?: GiftItem;
  onSaved: (gift: GiftItem) => void;
  onCancel: () => void;
  onDeleted?: (id: number) => void;
}

export function GiftForm({ members, initial, onSaved, onCancel, onDeleted }: GiftFormProps) {
  const { t } = useTranslation();
  const { currency: defaultCurrency } = usePreferences();
  const isEdit = Boolean(initial);
  const [recipientId, setRecipientId] = useState<string>(initial ? String(initial.recipient_id) : '');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [linkTitle, setLinkTitle] = useState<string | null>(initial?.link_title ?? null);
  const [linkSite, setLinkSite] = useState<string | null>(initial?.link_site ?? null);
  const [price, setPrice] = useState(initial?.price ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [status, setStatus] = useState<GiftItem['status']>(initial?.status ?? 'idea');
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
    if (!recipientId || !title.trim()) {
      setError(t('gifts.errRecipientTitle'));
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      recipient_id: Number(recipientId),
      title: title.trim(),
      url: url.trim() || null,
      link_title: url.trim() ? linkTitle : null,
      link_site: url.trim() ? linkSite : null,
      price: price !== '' && !Number.isNaN(parseFloat(String(price))) ? parseFloat(String(price)) : null,
      currency,
      status,
    };
    try {
      const saved = isEdit
        ? await api.patch<GiftItem>(`/gifts/${initial!.id}`, body)
        : await api.post<GiftItem>('/gifts', body);
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
      await api.delete(`/gifts/${initial.id}`);
      onDeleted(initial.id);
    } catch {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="gift_recipient" className={labelCls}>{t('gifts.recipient')}</label>
        <select id="gift_recipient" value={recipientId} onChange={(e) => setRecipientId(e.target.value)} className={fieldCls}>
          <option value="">{t('common.choose')}</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

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

      <div>
        <span className={labelCls}>{t('gifts.status')}</span>
        <div className="grid grid-cols-2 gap-2">
          {(['idea', 'bought'] as const).map((s) => (
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
                    : 'border-zinc-500/40 bg-zinc-700/40 text-zinc-100'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t(`gifts.status_${s}`)}
            </button>
          ))}
        </div>
      </div>

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
