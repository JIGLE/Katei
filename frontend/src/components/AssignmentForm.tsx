import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { User, HouseholdEvent, MoneyStream, Assignment } from '../lib/types';

interface AssignmentFormProps {
  users: User[];
  events: HouseholdEvent[];
  streams: MoneyStream[];
  onSaved: (assignment: Assignment) => void;
  onCancel: () => void;
}

type TargetKind = 'event' | 'money_stream';

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function AssignmentForm({ users, events, streams, onSaved, onCancel }: AssignmentFormProps) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState<string>(users[0] ? String(users[0].id) : '');
  const [kind, setKind] = useState<TargetKind>('event');
  const [targetId, setTargetId] = useState<string>('');
  const [role, setRole] = useState('owner');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) {
      setError(t('form.errChooseMember'));
      return;
    }
    if (!targetId) {
      setError(kind === 'event' ? t('form.errChooseEvent') : t('form.errChooseStream'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        user_id: Number(userId),
        role: role.trim() || 'owner',
      };
      if (kind === 'event') body.event_id = Number(targetId);
      else body.money_stream_id = Number(targetId);

      const saved = await api.post<Assignment>('/assignments', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errCreateAssignment'));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="member" className={labelCls}>{t('form.member')}</label>
        <select
          id="member"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className={fieldCls}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>

      <div>
        <span className={labelCls}>{t('household.responsibleFor')}</span>
        <div className="grid grid-cols-2 gap-2">
          {(['event', 'money_stream'] as TargetKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => { setKind(k); setTargetId(''); }}
              className={[
                'rounded-xl border px-2 py-2 text-xs font-medium transition-colors',
                kind === k
                  ? 'border-zinc-500/40 bg-zinc-700/40 text-zinc-100'
                  : 'border-zinc-800 text-zinc-500 hover:text-zinc-300',
              ].join(' ')}
            >
              {k === 'event' ? t('form.targetEvent') : t('form.targetStream')}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="target" className={labelCls}>
          {kind === 'event' ? t('form.targetEvent') : t('form.targetStream')}
        </label>
        <select
          id="target"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className={fieldCls}
        >
          <option value="">{t('common.choose')}</option>
          {kind === 'event'
            ? events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)
            : streams.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="role" className={labelCls}>{t('form.role')}</label>
        <input
          id="role"
          type="text"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder={t('form.rolePlaceholder')}
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
          {submitting ? t('common.saving') : t('household.assign')}
        </button>
      </div>
    </form>
  );
}
