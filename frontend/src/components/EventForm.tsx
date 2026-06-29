import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { HouseholdEvent, MoneyStream } from '../lib/types';

interface EventFormProps {
  onCreated: (event: HouseholdEvent) => void;
  onCancel: () => void;
}

type EventType = HouseholdEvent['event_type'];

const typeOptions: { value: EventType; label: string; active: string }[] = [
  { value: 'deadline', label: 'Deadline', active: 'bg-rose-500/15 text-rose-400 border-rose-500/40' },
  { value: 'payment', label: 'Payment', active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40' },
  { value: 'appointment', label: 'Appointment', active: 'bg-amber-500/15 text-amber-400 border-amber-500/40' },
];

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function EventForm({ onCreated, onCancel }: EventFormProps) {
  const [title, setTitle] = useState('');
  const [eventType, setEventType] = useState<EventType>('deadline');
  const [targetDate, setTargetDate] = useState('');
  const [description, setDescription] = useState('');
  const [moneyStreamId, setMoneyStreamId] = useState<string>('');

  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Money streams are optional links — fetch them so a payment can point
  // at the recurring cost it settles.
  useEffect(() => {
    api.get<MoneyStream[]>('/money-streams').then(setStreams).catch(() => setStreams([]));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !targetDate) {
      setError('Title and date are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        event_type: eventType,
        target_date: targetDate,
      };
      if (description.trim()) body.description = description.trim();
      if (moneyStreamId) body.money_stream_id = Number(moneyStreamId);

      const created = await api.post<HouseholdEvent>('/events', body);
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event.');
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className={labelCls}>Title</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Rent due"
          autoFocus
          className={fieldCls}
        />
      </div>

      <div>
        <span className={labelCls}>Type</span>
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
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="target_date" className={labelCls}>Date</label>
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
          <label htmlFor="money_stream" className={labelCls}>Linked cost (optional)</label>
          <select
            id="money_stream"
            value={moneyStreamId}
            onChange={(e) => setMoneyStreamId(e.target.value)}
            className={`${fieldCls} [color-scheme:dark]`}
          >
            <option value="">None</option>
            {streams.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="description" className={labelCls}>Notes (optional)</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Any extra detail…"
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
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-zinc-100 py-2.5 text-sm font-medium text-zinc-900 transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Add event'}
        </button>
      </div>
    </form>
  );
}
