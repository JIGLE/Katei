import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { MoneyStream, StreamType, MonthlySpend, MonthVariance } from '../lib/types';
import { Modal } from '../components/Modal';
import { StreamForm } from '../components/StreamForm';
import { SavingsRing } from '../components/SavingsRing';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../lib/preferences';
import { formatMoney, formatMonthShort } from '../lib/format';
import { useCountUp } from '../lib/useCountUp';

const freqKey: Record<string, string> = {
  monthly: 'freq.monthly',
  yearly: 'freq.yearly',
  'one-off': 'freq.oneOff',
};

// Monthly-equivalent of a recurring stream (monthly as-is, yearly ÷12, one-off excluded).
function monthlyEquiv(s: MoneyStream): number {
  if (!s.is_recurring) return 0;
  const a = parseFloat(s.amount);
  return s.frequency === 'monthly' ? a : s.frequency === 'yearly' ? a / 12 : 0;
}

function sumType(streams: MoneyStream[], type: StreamType): number {
  return streams.filter((s) => s.stream_type === type).reduce((t, s) => t + monthlyEquiv(s), 0);
}

interface CategorySlice {
  category: string;
  monthly: number;
  pct: number;
}

// Expense breakdown by category (the streams passed in are already expenses).
function byCategory(streams: MoneyStream[]): CategorySlice[] {
  const map = new Map<string, number>();
  for (const s of streams) {
    const m = monthlyEquiv(s);
    if (m <= 0) continue;
    const cat = s.category?.trim() || 'Uncategorised';
    map.set(cat, (map.get(cat) ?? 0) + m);
  }
  const total = Array.from(map.values()).reduce((a, b) => a + b, 0);
  return Array.from(map.entries())
    .map(([category, monthly]) => ({ category, monthly, pct: total ? (monthly / total) * 100 : 0 }))
    .sort((a, b) => b.monthly - a.monthly);
}

// Category bar shades stay within the money family.
const SEGMENT_BG = [
  'bg-emerald-500', 'bg-emerald-400', 'bg-emerald-600', 'bg-teal-400', 'bg-emerald-300', 'bg-teal-600', 'bg-zinc-600',
];

// Per-type accent for stream amounts & section labels.
const TYPE_AMOUNT: Record<StreamType, string> = {
  income: 'text-emerald-500',
  expense: 'text-zinc-200',
  savings: 'text-teal-300',
};
const TYPE_ORDER: StreamType[] = ['income', 'expense', 'savings'];
const TYPE_HEADER_KEY: Record<StreamType, string> = {
  income: 'money.income',
  expense: 'money.expenses',
  savings: 'money.savings',
};

export default function MoneyFlow() {
  const [streams, setStreams] = useState<MoneyStream[]>([]);
  const [trends, setTrends] = useState<MonthlySpend[]>([]);
  const [variance, setVariance] = useState<MonthVariance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState<StreamType>('expense');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [editing, setEditing] = useState<MoneyStream | null>(null);
  const { currency, locale, savings_goal } = usePreferences();
  const { t } = useTranslation();

  const fetchStreams = () => {
    setLoading(true);
    api
      .get<MoneyStream[]>('/money-streams')
      .then(setStreams)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStreams();
    // Spend history is independent of the stream list — a soft, non-blocking load.
    api.get<MonthlySpend[]>('/analytics/monthly-spend?months=6').then(setTrends).catch(() => {});
    api.get<MonthVariance[]>('/analytics/variance?months=6').then(setVariance).catch(() => {});
  }, []);

  const handleSaved = () => { setShowForm(false); setEditing(null); fetchStreams(); };
  const handleDeleted = () => { setEditing(null); fetchStreams(); };

  const openAdd = (type: StreamType) => { setNewType(type); setAddMenuOpen(false); setShowForm(true); };

  const income = sumType(streams, 'income');
  const expenses = sumType(streams, 'expense');
  const savings = sumType(streams, 'savings');
  const net = income - expenses - savings;
  const savingsRate = income > 0 ? (savings / income) * 100 : 0;
  const goalPct = savings_goal > 0 ? Math.min(100, (savings / savings_goal) * 100) : 0;
  // Net is the page's one hero figure (see the polish pass) — it counts up
  // once when the data first arrives, rather than just appearing.
  const animatedNet = useCountUp(net, !loading);

  const expenseStreams = streams.filter((s) => s.stream_type === 'expense');
  const slices = byCategory(expenseStreams);
  const catLabel = (c: string) => (c === 'Uncategorised' ? t('money.uncategorised') : c);

  const maxSpend = Math.max(0, ...trends.map((d) => d.total));
  const latestVar = [...variance].reverse().find((m) => m.expected > 0 || m.actual > 0);

  const fmt = (n: number) => formatMoney(n, currency, locale);
  // In the cramped 3-up summary cards, large localized amounts (e.g. Danish
  // "32.000,00 kr.") must wrap. Their currency separator is a non-breaking
  // space, so normalize it to a regular space to allow a clean break between
  // the number and the currency instead of splitting "kr." itself.
  const fmtWrap = (n: number) => fmt(n).replace(/[  ]/g, ' ');

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t('money.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-light text-zinc-100">{t('money.title')}</h1>
      </header>

      {/* Net — the headline: what's left after expenses and savings. This is the
          page's single focal point, so it leads as bare large type (no card),
          with the savings rate as a subordinate caption. */}
      <div>
        <p className="text-xs uppercase tracking-widest text-zinc-500">{t('money.net')}</p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className={`text-3xl font-light tabular-nums ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {loading ? '—' : fmt(animatedNet)}
          </p>
          {!loading && income > 0 && (
            <p className="text-xs text-zinc-500">
              {t('money.savingsRate')} <span className="tabular-nums text-zinc-400">{savingsRate.toFixed(0)}%</span>
            </p>
          )}
        </div>
      </div>

      {/* Income / Expenses / Savings — one panel of three related figures, split
          by dividers rather than three competing cards. Colour lives in the
          numbers (emerald / neutral / teal), not in card fills. */}
      <div className="grid grid-cols-3 divide-x divide-zinc-800/60 overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900">
        <div className="p-4">
          <p className="text-xs text-zinc-500">{t('money.income')}</p>
          <p className="mt-1 text-sm font-light leading-tight tabular-nums text-emerald-500">{loading ? '—' : fmtWrap(income)}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-zinc-500">{t('money.expenses')}</p>
          <p className="mt-1 text-sm font-light leading-tight tabular-nums text-zinc-200">{loading ? '—' : fmtWrap(expenses)}</p>
        </div>
        <div className="p-4">
          <p className="text-xs text-zinc-500">{t('money.savings')}</p>
          <p className="mt-1 text-sm font-light leading-tight tabular-nums text-teal-300">{loading ? '—' : fmtWrap(savings)}</p>
        </div>
      </div>

      {/* Savings goal progress — the one deliberately distinctive element on
          this page: a filling ring rather than a generic linear bar. */}
      {!loading && savings_goal > 0 && (
        <section className="flex items-center gap-5 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <SavingsRing pct={goalPct} label={t('money.savingsGoal')} />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{t('money.savingsGoal')}</p>
            <p className="mt-1 text-sm tabular-nums text-zinc-300">{fmt(savings)} <span className="text-zinc-600">/</span> {fmt(savings_goal)}</p>
          </div>
        </section>
      )}

      {/* Expected vs actual — did the paid bills match their usual amounts? */}
      {!loading && !error && latestVar && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{t('money.expectedActual')}</p>
            <p className="text-xs tabular-nums text-zinc-500">{formatMonthShort(latestVar.month, locale)}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-zinc-500">{t('money.expected')}</p>
              <p className="mt-1 text-sm font-light tabular-nums text-zinc-200">{fmt(latestVar.expected)}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">{t('money.actual')}</p>
              <p className={`mt-1 text-sm font-light tabular-nums ${latestVar.actual > latestVar.expected ? 'text-rose-500' : 'text-emerald-500'}`}>
                {fmt(latestVar.actual)}
                {latestVar.actual !== latestVar.expected && (
                  <span className="ml-1 text-xs">
                    ({latestVar.actual > latestVar.expected ? '+' : '−'}{fmt(Math.abs(latestVar.actual - latestVar.expected))})
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Spending trends — completed payments per month */}
      {!loading && !error && trends.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <div className="mb-4 flex items-baseline justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{t('money.trends')}</p>
            {maxSpend > 0 && <p className="text-xs tabular-nums text-zinc-500">{t('money.trendsHigh')} {fmt(maxSpend)}</p>}
          </div>
          {maxSpend === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">{t('money.trendsEmpty')}</p>
          ) : (
            <div className="flex h-28 gap-2">
              {trends.map((d) => {
                const h = maxSpend > 0 ? (d.total / maxSpend) * 100 : 0;
                return (
                  <div key={d.month} className="flex flex-1 flex-col items-center gap-1.5">
                    <div className="flex w-full flex-1 items-end" title={`${formatMonthShort(d.month, locale)} — ${fmt(d.total)}`}>
                      <div
                        className="w-full rounded-t bg-emerald-500/80"
                        style={{ height: `${d.total > 0 ? Math.max(h, 3) : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] tabular-nums text-zinc-500">{formatMonthShort(d.month, locale)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Expense breakdown */}
      {!loading && !error && slices.length > 0 && (
        <section className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-widest text-zinc-500">{t('money.whereItGoes')}</p>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
            {slices.map((s, i) => (
              <div key={s.category} className={SEGMENT_BG[i % SEGMENT_BG.length]} style={{ width: `${s.pct}%` }} title={`${catLabel(s.category)} — ${s.pct.toFixed(0)}%`} />
            ))}
          </div>
          <ul className="mt-4 space-y-2.5">
            {slices.map((s, i) => (
              <li key={s.category} className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${SEGMENT_BG[i % SEGMENT_BG.length]}`} />
                <span className="flex-1 truncate text-sm text-zinc-300">{catLabel(s.category)}</span>
                <span className="text-xs tabular-nums text-zinc-500">{s.pct.toFixed(0)}%</span>
                <span className="w-24 text-right text-sm tabular-nums text-zinc-200">{fmt(s.monthly)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-right text-xs text-zinc-600">{t('money.perMonth')}</p>
        </section>
      )}

      {loading && <p className="text-sm text-zinc-500">{t('common.loading')}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {!loading && !error && streams.length === 0 && (
        <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900 p-8 text-center">
          <p className="text-sm text-zinc-500">{t('money.noStreamsYet')}</p>
          <button onClick={() => openAdd('expense')} className="mt-3 text-sm text-zinc-300 underline-offset-2 hover:text-zinc-100">
            {t('money.addFirstStream')}
          </button>
        </div>
      )}

      {/* Streams grouped by type */}
      {!loading && !error && TYPE_ORDER.map((type) => {
        const group = streams.filter((s) => s.stream_type === type);
        if (group.length === 0) return null;
        return (
          <section key={type} className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">{t(TYPE_HEADER_KEY[type])}</p>
            {group.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setEditing(s)}
                className="flex w-full items-center gap-4 rounded-2xl border border-zinc-800/60 bg-zinc-900 p-4 text-left transition-colors hover:border-zinc-700"
              >
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 text-sm text-zinc-100">
                    <span className="truncate">{s.name}</span>
                    {s.automated && (
                      <span className="flex-shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-zinc-400">
                        {t('money.auto')}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {t(freqKey[s.frequency])}
                    {s.category?.trim() && <span className="ml-1">· {catLabel(s.category.trim())}</span>}
                  </p>
                </div>
                <p className={`flex-shrink-0 text-sm font-medium ${TYPE_AMOUNT[type]}`}>
                  {formatMoney(s.amount, s.currency, locale)}
                </p>
              </button>
            ))}
          </section>
        );
      })}

      {/* Contextual Add menu */}
      {addMenuOpen && (
        <button
          aria-label={t('common.close')}
          onClick={() => setAddMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/40"
        />
      )}
      <div className="fixed bottom-28 right-4 z-50 flex flex-col items-end gap-2">
        {addMenuOpen && (
          <div className="flex flex-col items-end gap-2">
            {([
              ['income', 'money.income', 'border-emerald-500/40 text-emerald-400'],
              ['expense', 'money.expense', 'border-zinc-700 text-zinc-200'],
              ['savings', 'money.savings', 'border-teal-500/40 text-teal-300'],
            ] as [StreamType, string, string][]).map(([type, key, cls]) => (
              <button
                key={type}
                onClick={() => openAdd(type)}
                className={`rounded-full border bg-zinc-900 px-4 py-2 text-sm font-medium shadow-lg ${cls}`}
              >
                {t(key)}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setAddMenuOpen((v) => !v)}
          aria-label={t('money.addStreamAria')}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 shadow-2xl transition-transform hover:scale-105 active:scale-95"
        >
          <svg className={`h-6 w-6 transition-transform ${addMenuOpen ? 'rotate-45' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      <Modal open={showForm} title={t('money.newStream')} onClose={() => setShowForm(false)}>
        <StreamForm initialType={newType} onSaved={handleSaved} onCancel={() => setShowForm(false)} />
      </Modal>

      <Modal open={!!editing} title={t('money.editStream')} onClose={() => setEditing(null)}>
        {editing && (
          <StreamForm initial={editing} onSaved={handleSaved} onCancel={() => setEditing(null)} onDeleted={handleDeleted} />
        )}
      </Modal>
    </div>
  );
}
