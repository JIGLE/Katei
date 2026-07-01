import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import { todayInTimezone } from '../lib/format';
import type { SavingsSummary, SavingsEntry, SavingsPot } from '../lib/types';

interface SavingsEntryFormProps {
  initial?: SavingsEntry;
  pots: SavingsPot[];
  onSaved: (summary: SavingsSummary) => void;
  onCancel: () => void;
  onDeleted?: (summary: SavingsSummary) => void;
}

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

// Record a one-time deposit (or withdrawal) into the savings ledger, or correct a
// mistaken one. This is the answer to "adding savings doesn't update the total" —
// every entry moves the balance, and a mistake can be edited or removed.
export function SavingsEntryForm({ initial, pots, onSaved, onCancel, onDeleted }: SavingsEntryFormProps) {
  const { t } = useTranslation();
  const { currency, timezone } = usePreferences();
  const isEdit = Boolean(initial);
  const defaultPotId = pots.find((p) => p.is_default)?.id ?? pots[0]?.id;
  const [amount, setAmount] = useState(initial ? String(Number(initial.amount)) : '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [goalId, setGoalId] = useState<number | undefined>(initial?.goal_id ?? defaultPotId);
  const [occurredOn, setOccurredOn] = useState(() => initial?.occurred_on?.slice(0, 10) ?? todayInTimezone(timezone));
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (amount === '' || Number.isNaN(parsed) || parsed === 0) {
      setError(t('form.errAmountInvalid'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = { amount: parsed, note: note.trim() || null, occurred_on: occurredOn, goal_id: goalId ?? null };
      const summary = isEdit
        ? await api.patch<SavingsSummary>(`/savings/entries/${initial!.id}`, body)
        : await api.post<SavingsSummary>('/savings/entries', body);
      onSaved(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errSaveStream'));
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDeleted) return;
    setSubmitting(true);
    try {
      const summary = await api.delete<SavingsSummary>(`/savings/entries/${initial.id}`);
      onDeleted(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errSaveStream'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-zinc-400">{t('money.addToSavingsHint')}</p>

      <div>
        <label htmlFor="savings-amount" className={labelCls}>
          {t('form.amount')} <span className="text-zinc-600">({currency})</span>
        </label>
        <input
          id="savings-amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
          className={fieldCls}
        />
      </div>

      {pots.length > 1 && (
        <div>
          <label htmlFor="savings-pot" className={labelCls}>{t('money.pot')}</label>
          <select
            id="savings-pot"
            value={goalId ?? ''}
            onChange={(e) => setGoalId(e.target.value ? Number(e.target.value) : undefined)}
            className={fieldCls}
          >
            {pots.map((p) => (
              <option key={p.id} value={p.id}>{p.is_default ? t('money.generalPot') : p.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="savings-note" className={labelCls}>{t('money.contributionNote')}</label>
        <input
          id="savings-note"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('money.contributionNotePlaceholder')}
          maxLength={120}
          className={fieldCls}
        />
      </div>

      <div>
        <label htmlFor="savings-date" className={labelCls}>{t('money.contributionDate')}</label>
        <input
          id="savings-date"
          type="date"
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
          className={`${fieldCls} [color-scheme:dark]`}
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
          {submitting ? t('common.saving') : isEdit ? t('common.saveChanges') : t('money.addToSavings')}
        </button>
      </div>

      {isEdit && onDeleted && (
        <button
          type="button"
          onClick={confirmDelete ? handleDelete : () => setConfirmDelete(true)}
          disabled={submitting}
          className="w-full pt-1 text-center text-xs text-rose-500/80 transition-colors hover:text-rose-400 disabled:opacity-50"
        >
          {confirmDelete ? t('form.confirmDelete') : t('money.deleteContribution')}
        </button>
      )}
    </form>
  );
}
