import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { MoneyStream } from '../lib/types';
import { Modal } from '../components/Modal';
import { StreamForm } from '../components/StreamForm';

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

// Monthly-equivalent spend per category (monthly as-is, yearly ÷ 12, one-offs
// excluded), sorted largest first with each slice's share of the total.
interface CategorySlice {
  category: string;
  monthly: number;
  pct: number;
}

function monthlyEquivByCategory(streams: MoneyStream[]): CategorySlice[] {
  const map = new Map<string, number>();
  for (const s of streams) {
    if (!s.is_recurring) continue;
    const monthly =
      s.frequency === 'monthly'
        ? parseFloat(s.amount)
        : s.frequency === 'yearly'
          ? parseFloat(s.amount) / 12
          : 0;
    if (monthly <= 0) continue;
    const cat = s.category ?? 'Uncategorised';
    map.set(cat, (map.get(cat) ?? 0) + monthly);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([category, monthly]) => ({ category, monthly, pct: total ? (monthly / total) * 100 : 0 }))
    .sort((a, b) => b.monthly - a.monthly);
}

// Money is always green (BRAND §5); categories are distinguished by shade only.
const SEGMENT_BG = [
  'bg-emerald-500',
  'bg-emerald-400',
  'bg-emerald-600',
  'bg-teal-400',
  'bg-emerald-300',
  'bg-teal-600',
  'bg-zinc-600',
];

export default function MoneyFlow() {
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MoneyStream | null>(null);

  const fetchStreams = () => {
    setLoading(true);
    api
      .get<MoneyStream[]>('/money-streams')
      .then(setStreams)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStreams(); }, []);

  const handleSaved = () => {
    setShowForm(false);
    setEditing(null);
    fetchStreams();
  };

  const handleDeleted = () => {
    setEditing(null);
    fetchStreams();
  };

  const categories = Array.from(new Set(streams.map((s) => s.category ?? 'Uncategorised')));
  const slices = monthlyEquivByCategory(streams);
  const monthlyEquiv = totalYearly(streams); // monthly burn incl. amortized yearly

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">Finance</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">Money Flow</h1>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-xs text-zinc-500">Monthly equivalent</p>
          <p className="mt-1 text-lg font-light text-emerald-500">
            {loading ? '—' : `$${fmt(monthlyEquiv)}`}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4">
          <p className="text-xs text-zinc-500">Yearly total</p>
          <p className="mt-1 text-lg font-light text-zinc-300">
            {loading ? '—' : `$${fmt(monthlyEquiv * 12)}`}
          </p>
        </div>
      </div>

      {/* Spending breakdown — proportion bar + per-category share */}
      {!loading && !error && slices.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">
            Where it goes
          </p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            {slices.map((s, i) => (
              <div
                key={s.category}
                className={SEGMENT_BG[i % SEGMENT_BG.length]}
                style={{ width: `${s.pct}%` }}
                title={`${s.category} — ${s.pct.toFixed(0)}%`}
              />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {slices.map((s, i) => (
              <li key={s.category} className="flex items-center gap-3">
                <span
                  className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${SEGMENT_BG[i % SEGMENT_BG.length]}`}
                />
                <span className="flex-1 truncate text-sm text-zinc-300">{s.category}</span>
                <span className="text-xs tabular-nums text-zinc-500">{s.pct.toFixed(0)}%</span>
                <span className="w-20 text-right text-sm tabular-nums text-zinc-200">
                  ${fmt(s.monthly)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-right text-xs text-zinc-600">per month</p>
        </section>
      )}

      {loading && <p className="text-sm text-zinc-500">Loading…</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && streams.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">No money streams yet.</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100"
          >
            Add your first stream
          </button>
        </div>
      )}

      {/* Streams grouped by category */}
      {!loading && !error && streams.length > 0 && categories.map((cat) => {
        const group = streams.filter((s) => (s.category ?? 'Uncategorised') === cat);
        return (
          <section key={cat} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{cat}</p>
            {group.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditing(s)}
                className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-700"
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
              </button>
            ))}
          </section>
        );
      })}

      {/* Floating add button — sits above the fixed bottom nav. */}
      <button
        onClick={() => setShowForm(true)}
        aria-label="Add money stream"
        className="fixed bottom-28 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
      >
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      </button>

      <Modal open={showForm} title="New money stream" onClose={() => setShowForm(false)}>
        <StreamForm onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!editing} title="Edit money stream" onClose={() => setEditing(null)}>
        {editing && (
          <StreamForm
            initial={editing}
            onSaved={handleSaved}
            onCancel={() => setEditing(null)}
            onDeleted={handleDeleted}
          />
        )}
      </Modal>
    </div>
  );
}
