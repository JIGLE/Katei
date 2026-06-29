import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { User, AssignmentDetail } from '../lib/types';

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
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<User[]>('/users'),
      api.get<AssignmentDetail[]>('/assignments'),
    ])
      .then(([u, a]) => { setUsers(u); setAssignments(a); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Group assignments by user for the detail section.
  const assignmentsByUser = (userId: number) =>
    assignments.filter((a) => a.user_id === userId);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Management</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Household</h1>
      </header>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && users.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">No household members yet.</p>
          <p className="mt-1 text-xs text-zinc-600">
            POST /api/users to add someone.
          </p>
        </div>
      )}

      {/* Member list */}
      {!loading && !error && users.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Members</p>
          {users.map((u) => {
            const userAssignments = assignmentsByUser(u.id);
            return (
              <div
                key={u.id}
                className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4"
              >
                {/* Member row */}
                <div className="flex items-center gap-4">
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
                      {userAssignments.length} assignment{userAssignments.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {userAssignments.length > 0 && (
                    <span
                      className={`text-xs font-medium capitalize ${roleColor(userAssignments[0].role)}`}
                    >
                      {userAssignments[0].role}
                    </span>
                  )}
                </div>

                {/* Assignments for this user */}
                {userAssignments.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-zinc-800/60 pt-3">
                    {userAssignments.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center gap-2 text-xs text-zinc-500"
                      >
                        <span className="h-1 w-1 rounded-full bg-zinc-700" />
                        {a.event_id && <span>Event #{a.event_id}</span>}
                        {a.money_stream_id && <span>Stream #{a.money_stream_id}</span>}
                        <span className={`ml-auto font-medium capitalize ${roleColor(a.role)}`}>
                          {a.role}
                        </span>
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
      {!loading && !error && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <p className="mb-1 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Assignments
          </p>
          <p className="text-xl font-light text-zinc-100">{assignments.length}</p>
          <p className="mt-0.5 text-xs text-zinc-500">total across all members</p>
        </section>
      )}
    </div>
  );
}
