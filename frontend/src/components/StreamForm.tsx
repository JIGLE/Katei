import { useState } from 'react';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { CURRENCIES } from '../lib/countries';
import type { MoneyStream } from '../lib/types';

interface StreamFormProps {
  initial?: MoneyStream;
  onSaved: (stream: MoneyStream) => void;
  onCancel: () => void;
  onDeleted?: (id: number) => void;
}

type Frequency = MoneyStream['frequency'];

const freqOptions: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'one-off', label: 'One-off' },
];

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function StreamForm({ initial, onSaved, onCancel, onDeleted }: StreamFormProps) {
  const { currency: defaultCurrency } = usePreferences();
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? defaultCurrency);
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'monthly');
  const [category, setCategory] = useState(initial?.category ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (amount === '' || Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        amount: parsedAmount,
        currency: currency.trim().toUpperCase() || 'USD',
        frequency,
        // "one-off" is a non-recurring cost; everything else recurs.
        is_recurring: frequency !== 'one-off',
        category: category.trim() || null,
      };
      const saved = isEdit
        ? await api.patch<MoneyStream>(`/money-streams/${initial!.id}`, body)
        : await api.post<MoneyStream>('/money-streams', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save money stream.');
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
      setError(err instanceof Error ? err.message : 'Failed to delete money stream.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className={labelCls}>Name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Rent"
          autoFocus
          className={fieldCls}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label htmlFor="amount" className={labelCls}>Amount</label>
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
          <label htmlFor="currency" className={labelCls}>Currency</label>
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
        <span className={labelCls}>Frequency</span>
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
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="category" className={labelCls}>Category (optional)</label>
        <input
          id="category"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Housing, Utilities, Subscriptions"
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
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add stream'}
        </button>
      </div>

      {isEdit && onDeleted && (
        <button
          type="button"
          onClick={confirmDelete ? handleDelete : () => setConfirmDelete(true)}
          disabled={submitting}
          className="w-full pt-1 text-center text-xs text-rose-500/80 transition-colors hover:text-rose-400 disabled:opacity-50"
        >
          {confirmDelete ? 'Tap again to confirm delete' : 'Delete stream'}
        </button>
      )}
    </form>
  );
}
