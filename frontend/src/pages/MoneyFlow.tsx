import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { MoneyStream } from '../lib/types';

const freqLabel: Record<string, string> = {
  monthly: 'Monthly',
  yearly: 'Yearly',
  'one-off': 'One-off',
};

function totalMonthly(streams: MoneyStream[]): number {
  return streams
    .filter((s) => s.is_recurring && s.frequency === 'monthly')
    .reduce((sum, s) => sum + parseFloat(s.amount), 0);
}

function totalYearly(streams: MoneyStream[]): number {
  const yearly = streams
    .filter((s) => s.is_recurring && s.frequency === 'yearly')
    .reduce((sum, s) => sum + parseFloat(s.amount) / 12, 0);
  return totalMonthly(streams) + yearly;
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MoneyFlow() {
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MoneyStream[]>('/money-streams')
      .then(setStreams)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = Array.from(new Set(streams.map((s) => s.category ?? 'Uncategorised')));

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Finance</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Money Flow</h1>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-zinc-500">Monthly recurring</p>
          <p className="mt-1 text-lg font-light text-emerald-500">
            {loading ? '—' : `$${fmt(totalMonthly(streams))}`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Monthly equiv.</p>
          <p className="mt-1 text-lg font-light text-zinc-300">
            {loading ? '—' : `$${fmt(totalYearly(streams))}`}
          </p>
        </div>
      </div>

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && streams.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">No money streams yet.</p>
        </div>
      )}

      {/* Streams grouped by category */}
      {!loading && !error && streams.length > 0 && categories.map((cat) => {
        const group = streams.filter((s) => (s.category ?? 'Uncategorised') === cat);
        return (
          <section key={cat} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{cat}</p>
            {group.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-100">{s.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {freqLabel[s.frequency]} · {s.currency}
                    {!s.is_recurring && (
                      <span className="ml-2 rounded-full bg-zinc-800 px-1.5 py-0.5 text-zinc-400">
                        one-off
                      </span>
                    )}
                  </p>
                </div>
                <p className="flex-shrink-0 text-sm font-medium text-emerald-500">
                  ${parseFloat(s.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
