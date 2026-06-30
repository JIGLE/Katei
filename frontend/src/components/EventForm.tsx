import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { HouseholdEvent, MoneyStream } from '../lib/types';

interface EventFormProps {
  initial?: HouseholdEvent;
  onSaved: (event: HouseholdEvent) => void;
  onCancel: () => void;
  onDeleted?: (id: number) => void;
}

type EventType = HouseholdEvent['event_type'];

const typeOptions: { value: EventType; labelKey: string; active: string }[] = [
  { value: 'deadline', labelKey: 'eventType.deadline', active: 'bg-rose-500/15 text-rose-400 border-rose-500/40' },
  { value: 'payment', labelKey: 'eventType.payment', active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
  { value: 'appointment', labelKey: 'eventType.appointment', active: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
];

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function EventForm({ initial, onSaved, onCancel, onDeleted }: EventFormProps) {
  const { t } = useTranslation();
  const isEdit = Boolean(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [eventType, setEventType] = useState<EventType>(initial?.event_type ?? 'deadline');
  const [targetDate, setTargetDate] = useState(initial?.target_date?.slice(0, 10) ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [moneyStreamId, setMoneyStreamId] = useState<string>(
    initial?.money_stream_id ? String(initial.money_stream_id) : '',
  );

  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Money streams are optional links — fetch them so a payment can point
  // at the recurring cost it settles.
  useEffect(() => {
    api.get<MoneyStream[]>('/money-streams').then(setStreams).catch(() => setStreams([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) {
      setError(t('form.errTitleDateRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        event_type: eventType,
        target_date: targetDate,
        money_stream_id: moneyStreamId ? Number(moneyStreamId) : null,
        description: description.trim() || null,
      };
      const saved = isEdit
        ? await api.patch<HouseholdEvent>(`/events/${initial!.id}`, body)
        : await api.post<HouseholdEvent>('/events', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errSaveEvent'));
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDeleted) return;
    setSubmitting(true);
    try {
      await api.delete(`/events/${initial.id}`);
      onDeleted(initial.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errDeleteEvent'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className={labelCls}>{t('form.title')}</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('form.titlePlaceholder')}
          autoFocus
          className={fieldCls}
        />
      </div>

      <div>
        <span className={labelCls}>{t('form.type')}</span>
        <div className="grid grid-cols-3 gap-2">
          {typeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setEventType(opt.value)}
              className={[
                'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                eventType === opt.value
                  ? opt.active
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="target_date" className={labelCls}>{t('form.date')}</label>
        <input
          id="target_date"
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          className={`${fieldCls} [color-scheme:dark]`}
        />
      </div>

      {streams.length > 0 && (
        <div>
          <label htmlFor="money_stream" className={labelCls}>{t('form.linkedCost')}</label>
          <select
            id="money_stream"
            value={moneyStreamId}
            onChange={(e) => setMoneyStreamId(e.target.value)}
            className={`${fieldCls} [color-scheme:dark]`}
          >
            <option value="">{t('common.none')}</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="description" className={labelCls}>{t('form.notes')}</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t('form.notesPlaceholder')}
          className={`${fieldCls} resize-none`}
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
          {submitting ? t('common.saving') : isEdit ? t('common.saveChanges') : t('form.addEvent')}
        </button>
      </div>

      {isEdit && onDeleted && (
        <button
          type="button"
          onClick={confirmDelete ? handleDelete : () => setConfirmDelete(true)}
          disabled={submitting}
          className="w-full pt-1 text-center text-xs text-rose-500/80 transition-colors hover:text-rose-400 disabled:opacity-50"
        >
          {confirmDelete ? t('form.confirmDelete') : t('form.deleteEvent')}
        </button>
      )}
    </form>
  );
}
