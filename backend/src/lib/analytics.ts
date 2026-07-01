// Spending-history analytics. The app stores recurring definitions + events,
// not transactions, so the only real spend history is completed *payment*
// events linked to a money stream (the amount comes from the stream). These
// pure helpers shape that into a dense monthly series; the SQL lives in the
// analytics route. Kept side-effect free so they can be unit-tested without a DB.

export interface MonthlySpend {
  month: string; // 'YYYY-MM'
  total: number;
}

/** The last `months` calendar months ending with fromDate's month, as 'YYYY-MM'. */
export function monthKeys(months: number, fromDate: Date = new Date()): string[] {
  const y = fromDate.getUTCFullYear();
  const m = fromDate.getUTCMonth(); // 0-based
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

/** First day of the earliest month in the window, as 'YYYY-MM-DD' (SQL lower bound). */
export function windowStart(months: number, fromDate: Date = new Date()): string {
  return `${monthKeys(months, fromDate)[0]}-01`;
}

/** Merge grouped { month, total } rows into a dense series across the window. */
export function buildMonthlySpend(
  rows: { month: string; total: number | string }[],
  months: number,
  fromDate: Date = new Date(),
): MonthlySpend[] {
  const totals = new Map(rows.map((r) => [r.month, Number(r.total) || 0]));
  return monthKeys(months, fromDate).map((month) => ({ month, total: totals.get(month) ?? 0 }));
}

export interface MonthVariance {
  month: string; // 'YYYY-MM'
  expected: number; // what the linked streams said the paid bills should cost
  actual: number; // what was actually paid (actual_amount, falling back to expected)
}

/** Dense expected-vs-actual series across the window (paid payments only). */
export function buildVariance(
  rows: { month: string; expected: number | string; actual: number | string }[],
  months: number,
  fromDate: Date = new Date(),
): MonthVariance[] {
  const m = new Map(
    rows.map((r) => [r.month, { expected: Number(r.expected) || 0, actual: Number(r.actual) || 0 }]),
  );
  return monthKeys(months, fromDate).map((month) => ({ month, ...(m.get(month) ?? { expected: 0, actual: 0 }) }));
}
