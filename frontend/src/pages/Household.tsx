import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import type { User, AssignmentDetail, HouseholdEvent, MoneyStream } from '../lib/types';
import { Modal } from '../components/Modal';
import { MemberForm } from '../components/MemberForm';
import { AssignmentForm } from '../components/AssignmentForm';

function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const roleColors: Record<string, string> = {
  admin: 'text-amber-500',
  owner: 'text-emerald-500',
  member: 'text-zinc-400',
};

function roleColor(role: string): string {
  return roleColors[role.toLowerCase()] ?? 'text-zinc-400';
}

export default function Household() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [events, setEvents] = useState<HouseholdEvent[]>([]);
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMember, setEditingMember] = useState<User | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      api.get<User[]>('/users'),
      api.get<AssignmentDetail[]>('/assignments'),
      api.get<HouseholdEvent[]>('/events'),
      api.get<MoneyStream[]>('/money-streams'),
    ])
      .then(([u, a, e, s]) => { setUsers(u); setAssignments(a); setEvents(e); setStreams(s); })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleSaved = () => {
    setShowMemberForm(false);
    setEditingMember(null);
    setShowAssignForm(false);
    fetchAll();
  };

  const assignmentsByUser = (userId: number) =>
    assignments.filter((a) => a.user_id === userId);

  const eventTitle = (id: number) => events.find((e) => e.id === id)?.title ?? `Event #${id}`;
  const streamName = (id: number) => streams.find((s) => s.id === id)?.name ?? `Stream #${id}`;

  const removeAssignment = async (id: number) => {
    try {
      await api.delete(`/assignments/${id}`);
      setConfirmRemove(null);
      fetchAll();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">{t('household.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-light text-zinc-100">{t('household.title')}</h1>
        </div>
        {users.length > 0 && (
          <button
            onClick={() => setShowAssignForm(true)}
            className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-300"
          >
            + {t('household.assign')}
          </button>
        )}
      </header>

      {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">{t('household.noMembers')}</p>
          <button
            onClick={() => setShowMemberForm(true)}
            className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
          >
            {t('household.addFirstMember')}
          </button>
        </div>
      )}

      {/* Member list */}
      {!loading && !error && users.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{t('household.members')}</p>
          {users.map((u) => {
            const userAssignments = assignmentsByUser(u.id);
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4"
              >
                {/* Member row — tap to edit */}
                <button
                  type="button"
                  onClick={() => setEditingMember(u)}
                  className="flex w-full items-center gap-4 text-left"
                >
                  {u.avatar_url ? (
                    <img
                      src={u.avatar_url}
                      alt={u.name}
                      className="h-9 w-9 flex-shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
                      {initials(u.name)}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-sm text-zinc-100">{u.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {t('household.assignmentCount', { count: userAssignments.length })}
                    </p>
                  </div>
                </button>

                {/* Assignments for this user */}
                {userAssignments.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-zinc-800/60 pt-3">
                    {userAssignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 text-xs text-zinc-400"
                      >
                        <span className="h-1 w-1 rounded-full bg-zinc-700" />
                        {a.event_id != null && <span>{eventTitle(a.event_id)}</span>}
                        {a.money_stream_id != null && <span>{streamName(a.money_stream_id)}</span>}
                        <span className={`ml-auto font-medium capitalize ${roleColor(a.role)}`}>
                          {a.role}
                        </span>
                        <button
                          type="button"
                          onClick={() => (confirmRemove === a.id ? removeAssignment(a.id) : setConfirmRemove(a.id))}
                          className={[
                            'rounded-md px-1.5 transition-colors',
                            confirmRemove === a.id ? 'text-rose-400' : 'text-zinc-600 hover:text-zinc-400',
                          ].join(' ')}
                          aria-label={t('household.removeAssignmentAria')}
                        >
                          {confirmRemove === a.id ? t('common.confirm') : '×'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Assignment summary */}
      {!loading && !error && users.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-zinc-500">
            {t('household.assignmentsLabel')}
          </p>
          <p className="text-xl font-light text-zinc-100">{assignments.length}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{t('household.totalAcrossMembers')}</p>
        </section>
      )}

      {/* Floating add-member button. */}
      <button
        onClick={() => setShowMemberForm(true)}
        aria-label={t('household.addMemberAria')}
        className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <Modal open={showMemberForm} title={t('household.newMember')} onClose={() => setShowMemberForm(false)}>
        <MemberForm onSaved={handleSaved} onCancel={() => setShowMemberForm(false)} />
      </Modal>

      <Modal open={!!editingMember} title={t('household.editMember')} onClose={() => setEditingMember(null)}>
        {editingMember && (
          <MemberForm
            initial={editingMember}
            onSaved={handleSaved}
            onCancel={() => setEditingMember(null)}
            onDeleted={handleSaved}
          />
        )}
      </Modal>

      <Modal open={showAssignForm} title={t('household.newAssignment')} onClose={() => setShowAssignForm(false)}>
        <AssignmentForm
          users={users}
          events={events}
          streams={streams}
          onSaved={handleSaved}
          onCancel={() => setShowAssignForm(false)}
        />
      </Modal>
    </div>
  );
}
