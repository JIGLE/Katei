import { useState } from 'react';
import { api } from '../lib/api';
import type { User } from '../lib/types';

interface MemberFormProps {
  initial?: User;
  onSaved: (user: User) => void;
  onCancel: () => void;
  onDeleted?: (id: number) => void;
}

const labelCls = 'mb-1.5 block text-xs font-medium uppercase tracking-widest text-zinc-500';
const fieldCls =
  'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 ' +
  'placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none';

export function MemberForm({ initial, onSaved, onCancel, onDeleted }: MemberFormProps) {
  const isEdit = Boolean(initial);
  const [name, setName] = useState(initial?.name ?? '');
  const [avatarUrl, setAvatarUrl] = useState(initial?.avatar_url ?? '');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (avatarUrl.trim()) body.avatar_url = avatarUrl.trim();
      const saved = isEdit
        ? await api.patch<User>(`/users/${initial!.id}`, body)
        : await api.post<User>('/users', body);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save member.');
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDeleted) return;
    setSubmitting(true);
    try {
      await api.delete(`/users/${initial.id}`);
      onDeleted(initial.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete member.');
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
          placeholder="e.g. Sam"
          autoFocus
          className={fieldCls}
        />
      </div>

      <div>
        <label htmlFor="avatar_url" className={labelCls}>Avatar URL (optional)</label>
        <input
          id="avatar_url"
          type="url"
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          placeholder="https://…"
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
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add member'}
        </button>
      </div>

      {isEdit && onDeleted && (
        <button
          type="button"
          onClick={confirmDelete ? handleDelete : () => setConfirmDelete(true)}
          disabled={submitting}
          className="w-full pt-1 text-center text-xs text-rose-500/80 transition-colors hover:text-rose-400 disabled:opacity-50"
        >
          {confirmDelete ? 'Tap again to confirm delete' : 'Delete member'}
        </button>
      )}
    </form>
  );
}
