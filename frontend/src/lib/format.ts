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

/** 'YYYY-MM' → localized short month label (e.g. "Jun"). */
export function formatMonthShort(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1));
  try {
    return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(d);
  } catch {
    return new Intl.DateTimeFormat(FALLBACK.locale, { month: 'short', timeZone: 'UTC' }).format(d);
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

/** Days until the next occurrence of a 'YYYY-MM-DD' birthday, or null. */
export function daysToBirthday(birthday: string | null): number | null {
  if (!birthday) return null;
  const [, m, d] = birthday.split('-').map(Number);
  if (!m || !d) return null;
  const today = new Date();
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < t0) next = new Date(today.getFullYear() + 1, m - 1, d);
  return Math.round((next.getTime() - t0.getTime()) / 86_400_000);
}

/**
 * Localized relative-day label ("today", "tomorrow", "in 4 days", "2 days ago")
 * via Intl.RelativeTimeFormat — so it needs no translation catalog.
 */
export function formatRelativeDay(days: number, locale: string): string {
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
  } catch {
    return new Intl.RelativeTimeFormat(FALLBACK.locale, { numeric: 'auto' }).format(days, 'day');
  }
}

/**
 * Localized relative-time label from a timestamp to now ("just now",
 * "5 minutes ago", "2 hours ago", "3 days ago"). Picks the coarsest sensible
 * unit via Intl.RelativeTimeFormat, so it needs no translation catalog.
 */
export function formatRelativeTime(dateStr: string, locale: string): string {
  const then = new Date(dateStr).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = (l: string) => new Intl.RelativeTimeFormat(l, { numeric: 'auto' });
  try {
    const f = rtf(locale);
    if (abs < 45) return f.format(0, 'second'); // "now" with numeric:auto
    if (abs < 3600) return f.format(Math.round(seconds / 60), 'minute');
    if (abs < 86_400) return f.format(Math.round(seconds / 3600), 'hour');
    if (abs < 2_592_000) return f.format(Math.round(seconds / 86_400), 'day');
    if (abs < 31_536_000) return f.format(Math.round(seconds / 2_592_000), 'month');
    return f.format(Math.round(seconds / 31_536_000), 'year');
  } catch {
    return rtf(FALLBACK.locale).format(Math.round(seconds / 86_400), 'day');
  }
}
