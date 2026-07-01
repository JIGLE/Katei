import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { usePreferences } from '../lib/preferences';
import type { SavingsSummary, SavingsPot } from '../lib/types';

interface GoalFormProps {
  initial?: SavingsPot;
  onSaved: (summary: SavingsSummary) => void;
  onCancel: () => void;
  onDeleted?: (summary: SavingsSummary) => void;
}

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

const ICONS = ['🐷', '🏖', '🛋', '📺', '🚗', '🎁', '🏠', '💍', '🎓', '🚑', '🐾', '✈️'];

// Create or edit a savings pot (a named goal). The default pot's name is fixed;
// its target and icon can still be tuned, and it can't be deleted.
export function GoalForm({ initial, onSaved, onCancel, onDeleted }: GoalFormProps) {
  const { t } = useTranslation();
  const { currency } = usePreferences();
  const isEdit = Boolean(initial);
  const isDefault = initial?.is_default ?? false;
  const [name, setName] = useState(initial?.name ?? '');
  const [target, setTarget] = useState(initial?.target ? String(initial.target) : '');
  const [icon, setIcon] = useState(initial?.icon ?? '🐷');
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isDefault && !name.trim()) {
      setError(t('form.errNameRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        target_amount: target.trim() ? Number(target) : null,
        icon: icon.trim() || null,
      };
      if (!isDefault) body.name = name.trim();
      const summary = isEdit
        ? await api.patch<SavingsSummary>(`/savings/goals/${initial!.id}`, body)
        : await api.post<SavingsSummary>('/savings/goals', { name: name.trim(), ...body });
      onSaved(summary);
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('form.errSaveStream'));
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDeleted) return;
    setSubmitting(true);
    try {
      onDeleted(await api.delete<SavingsSummary>(`/savings/goals/${initial.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+\s+/, '') : t('form.errSaveStream'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!isDefault && (
        <div>
          <label htmlFor="pot-name" className={labelCls}>{t('money.potName')}</label>
          <input
            id="pot-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('money.potNamePlaceholder')}
            maxLength={80}
            autoFocus
            className={fieldCls}
          />
        </div>
      )}

      <div>
        <span className={labelCls}>{t('money.potIcon')}</span>
        <div className="flex flex-wrap gap-2">
          {ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(ic)}
              className={[
                'flex h-9 w-9 items-center justify-center rounded-xl border text-base transition-colors',
                icon === ic ? 'border-teal-500/50 bg-teal-500/15' : 'border-zinc-800 hover:border-zinc-700',
              ].join(' ')}
              aria-pressed={icon === ic}
            >
              {ic}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="pot-target" className={labelCls}>
          {t('money.potTarget')} <span className="text-zinc-600">({currency})</span>
        </label>
        <input
          id="pot-target"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={t('money.potTargetPlaceholder')}
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
          {submitting ? t('common.saving') : isEdit ? t('common.saveChanges') : t('money.newPot')}
        </button>
      </div>

      {isEdit && onDeleted && !isDefault && (
        <button
          type="button"
          onClick={confirmDelete ? handleDelete : () => setConfirmDelete(true)}
          disabled={submitting}
          className="w-full pt-1 text-center text-xs text-rose-500/80 transition-colors hover:text-rose-400 disabled:opacity-50"
        >
          {confirmDelete ? t('form.confirmDelete') : t('money.deletePot')}
        </button>
      )}
    </form>
  );
}
