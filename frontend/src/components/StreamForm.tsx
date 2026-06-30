import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { CURRENCIES } from '../lib/countries';
import type { MoneyStream, StreamType, DueShift } from '../lib/types';

interface StreamFormProps {
  initial?: MoneyStream;
  initialType?: StreamType;
  onSaved: (stream: MoneyStream) => void;
  onCancel: () => void;
  onDeleted?: (id: number) => void;
}

type Frequency = MoneyStream['frequency'];

const freqOptions: { value: Frequency; labelKey: string }[] = [
  { value: 'monthly', labelKey: 'freq.monthly' },
  { value: 'yearly', labelKey: 'freq.yearly' },
  { value: 'one-off', labelKey: 'freq.oneOff' },
];

// Type sub-palette (BRAND §5 extension): income emerald, savings teal, expense neutral.
const typeOptions: { value: StreamType; labelKey: string; active: string }[] = [
  { value: 'income', labelKey: 'money.income', active: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' },
  { value: 'expense', labelKey: 'money.expense', active: 'border-zinc-500/40 bg-zinc-700/40 text-zinc-100' },
  { value: 'savings', labelKey: 'money.savings', active: 'border-teal-500/40 bg-teal-500/15 text-teal-300' },
];

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function StreamForm({ initial, initialType, onSaved, onCancel, onDeleted }: StreamFormProps) {
  const { currency: defaultCurrency } = usePreferences();
  const { t } = useTranslation();
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [streamType, setStreamType] = useState<StreamType>(initial?.stream_type ?? initialType ?? 'expense');
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'monthly');
  const [dueDay, setDueDay] = useState<number>(initial?.due_day ?? 1);
  const [dueShift, setDueShift] = useState<DueShift>(initial?.due_shift ?? 'next');
  const [category, setCategory] = useState(initial?.category ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!name.trim()) {
      setError(t('form.errNameRequired'));
      return;
    }
    if (amount === '' || Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setError(t('form.errAmountInvalid'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        amount: parsedAmount,
        currency: currency.trim().toUpperCase() || 'USD',
        stream_type: streamType,
        frequency,
        // "one-off" is a non-recurring cost; everything else recurs.
        is_recurring: frequency !== 'one-off',
        due_day: dueDay,
        due_shift: dueShift,
        category: category.trim() || null,
      };
      const saved = isEdit
        ? await api.patch<MoneyStream>(`/money-streams/${initial!.id}`, body)
        : await api.post<MoneyStream>('/money-streams', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errSaveStream'));
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDeleted) return;
    setSubmitting(true);
    try {
      await api.delete(`/money-streams/${initial.id}`);
      onDeleted(initial.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errDeleteStream'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className={labelCls}>{t('form.name')}</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('form.streamNamePlaceholder')}
          autoFocus
          className={fieldCls}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="amount" className={labelCls}>{t('form.amount')}</label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className={fieldCls}
          />
        </div>
        <div className="w-28">
          <label htmlFor="currency" className={labelCls}>{t('form.currency')}</label>
          <select
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={`${fieldCls} [color-scheme:dark]`}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className={labelCls}>{t('form.type')}</span>
        <div className="grid grid-cols-3 gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStreamType(opt.value)}
              className={[
                'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                streamType === opt.value ? opt.active : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelCls}>{t('form.frequency')}</span>
        <div className="grid grid-cols-3 gap-2">
          {freqOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFrequency(opt.value)}
              className={[
                'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                frequency === opt.value
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {frequency !== 'one-off' && (
        <div className="flex gap-3">
          <div className="w-32">
            <label htmlFor="due_day" className={labelCls}>{t('form.dueDay')}</label>
            <select
              id="due_day"
              value={dueDay}
              onChange={(e) => setDueDay(Number(e.target.value))}
              className={`${fieldCls} [color-scheme:dark]`}
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
              <option value={31}>{t('form.lastDay')}</option>
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label htmlFor="due_shift" className={labelCls}>{t('form.dueShift')}</label>
            <select
              id="due_shift"
              value={dueShift}
              onChange={(e) => setDueShift(e.target.value as DueShift)}
              className={`${fieldCls} [color-scheme:dark]`}
            >
              <option value="next">{t('form.dueShiftNext')}</option>
              <option value="prev">{t('form.dueShiftPrev')}</option>
              <option value="none">{t('form.dueShiftNone')}</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <label htmlFor="category" className={labelCls}>{t('form.category')}</label>
        <input
          id="category"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t('form.categoryPlaceholder')}
          className={fieldCls}
        />
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex gap-3 pt-1">
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
          {submitting ? t('common.saving') : isEdit ? t('common.saveChanges') : t('form.addStream')}
        </button>
      </div>

      {isEdit && onDeleted && (
        <button
          type="button"
          onClick={confirmDelete ? handleDelete : () => setConfirmDelete(true)}
          disabled={submitting}
          className="w-full pt-1 text-center text-xs text-rose-500/80 transition-colors hover:text-rose-400 disabled:opacity-50"
        >
          {confirmDelete ? t('form.confirmDelete') : t('form.deleteStream')}
        </button>
      )}
    </form>
  );
}
