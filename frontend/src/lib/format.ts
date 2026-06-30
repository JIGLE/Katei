// Locale + timezone aware formatting — the single source of truth for how money
// and dates render. Everything goes through here so a household's chosen
// currency / locale / timezone is honoured consistently. Intl throws on invalid
// codes, so each helper falls back to EU-leaning defaults.

const FALLBACK = { currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' };

export function formatMoney(amount: number | string, currency: string, locale: string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  const value = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch {
    return new Intl.NumberFormat(FALLBACK.locale, {
      style: 'currency',
      currency: FALLBACK.currency,
    }).format(value);
  }
}

export function formatDate(date: string, locale: string, timezone?: string): string {
  const d = new Date(date);
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    }).format(d);
  } catch {
    return new Intl.DateTimeFormat(FALLBACK.locale, { month: 'short', day: 'numeric' }).format(d);
  }
}

/** Midnight "today" as a YYYY-MM-DD string in the given timezone. */
export function todayInTimezone(timezone?: string): string {
  try {
    // en-CA yields YYYY-MM-DD; timeZone shifts "now" into the household's day.
    return new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: timezone,
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Whole days from "today" (in the household timezone) to a target date.
 * Negative = overdue, 0 = today, positive = future. Compares calendar days, so
 * it is unaffected by clock time.
 */
export function daysUntil(dateStr: string, timezone?: string): number {
  const today = new Date(`${todayInTimezone(timezone)}T00:00:00Z`).getTime();
  const target = new Date(`${dateStr.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}
