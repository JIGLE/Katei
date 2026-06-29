// Household control tower — shows what needs attention right now.

const urgentItems = [
  { label: 'Rent due in 3 days', accent: 'amber' },
  { label: 'Car insurance overdue', accent: 'rose' },
  { label: 'Electricity — auto-pay active', accent: 'emerald' },
];

const accentMap = {
  amber: { pill: 'bg-amber-500/10 text-amber-500', dot: 'bg-amber-500' },
  rose: { pill: 'bg-rose-500/10 text-rose-500', dot: 'bg-rose-500' },
  emerald: { pill: 'bg-emerald-500/10 text-emerald-500', dot: 'bg-emerald-500' },
} as const;

type Accent = keyof typeof accentMap;

export default function Overview() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Home</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Overview</h1>
      </header>

      {/* Attention banner */}
      <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
        <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
          Needs attention
        </p>
        <ul className="space-y-3">
          {urgentItems.map((item) => {
            const styles = accentMap[item.accent as Accent];
            return (
              <li key={item.label} className="flex items-center gap-3">
                <span className={`h-2 w-2 flex-shrink-0 rounded-full ${styles.dot}`} />
                <span className="flex-1 text-sm text-zinc-200">{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles.pill}`}>
                  {item.accent}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Monthly outflow</p>
          <p className="mt-1 text-xl font-light text-emerald-500">—</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Upcoming events</p>
          <p className="mt-1 text-xl font-light text-amber-500">—</p>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-600">
        Data wiring arrives in the next phase.
      </p>
    </div>
  );
}
