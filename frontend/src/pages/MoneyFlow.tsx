// Clean tracking layer for fixed monthly costs, recurring utilities, and subscriptions.

const sampleStreams = [
  { name: 'Rent', amount: '1 800.00', frequency: 'monthly', category: 'Housing' },
  { name: 'Electricity', amount: '95.00', frequency: 'monthly', category: 'Utilities' },
  { name: 'Netflix', amount: '17.99', frequency: 'monthly', category: 'Subscriptions' },
  { name: 'Car insurance', amount: '840.00', frequency: 'yearly', category: 'Insurance' },
];

export default function MoneyFlow() {
  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Finance</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Money Flow</h1>
      </header>

      {/* Summary card */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
        <p className="text-xs text-zinc-500">Total monthly recurring</p>
        <p className="mt-1 text-3xl font-light text-emerald-500">— USD</p>
      </div>

      {/* Stream list */}
      <section className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Streams</p>
        {sampleStreams.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4"
          >
            <div className="flex-1">
              <p className="text-sm text-zinc-100">{s.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {s.category} · {s.frequency}
              </p>
            </div>
            <p className="text-sm font-medium text-emerald-500">${s.amount}</p>
          </div>
        ))}
      </section>

      <p className="text-center text-xs text-zinc-600">
        Live streams load from /api/money-streams in the next phase.
      </p>
    </div>
  );
}
