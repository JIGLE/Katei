// Mapping layout for managing family members, permissions, and operational assignments.

const sampleMembers = [
  { name: 'Alex', role: 'Admin', initials: 'AL' },
  { name: 'Jordan', role: 'Member', initials: 'JO' },
  { name: 'Casey', role: 'Member', initials: 'CA' },
];

export default function Household() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Management</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Household</h1>
      </header>

      {/* Member list */}
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Members</p>
        {sampleMembers.map((m) => (
          <div
            key={m.name}
            className="flex items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4"
          >
            {/* Avatar */}
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-medium text-zinc-300">
              {m.initials}
            </div>

            <div className="flex-1">
              <p className="text-sm text-zinc-100">{m.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{m.role}</p>
            </div>

            <button className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300">
              Manage
            </button>
          </div>
        ))}
      </section>

      {/* Assignments summary */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Assignments
        </p>
        <p className="text-sm text-zinc-500">
          Operational assignments and permission mappings load from /api/assignments in the next phase.
        </p>
      </section>
    </div>
  );
}
