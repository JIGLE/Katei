// Centralised environment configuration for the Katei API.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.BACKEND_PORT ?? 3000),
  host: process.env.BACKEND_HOST ?? '0.0.0.0',
  databaseUrl: required('DATABASE_URL'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  // Optional overrides for app_settings. When set, these win on every boot so a
  // wiped settings table (or fresh volume) self-heals instead of silently
  // logging everyone out / stopping reminders. When unset, behaviour is
  // unchanged (random auth secret, UI-managed ntfy URL).
  jwtSecret: process.env.JWT_SECRET || undefined,
  ntfyUrl: process.env.NTFY_URL || undefined,
  leadDays: process.env.LEAD_DAYS || undefined,
  // Optional EU-leaning locale/currency seeds for the household preferences.
  country: process.env.COUNTRY || undefined,
  defaultCurrency: process.env.DEFAULT_CURRENCY || undefined,
  locale: process.env.LOCALE || undefined,
  timezone: process.env.TZ || undefined,
} as const;
