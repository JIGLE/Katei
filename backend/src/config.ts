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
  // JWT_SECRET is authoritative on every boot (so sessions survive a wiped
  // settings table / fresh volume — see getOrCreateAuthSecret). The remaining
  // env values below are only *initial defaults*: they seed an absent setting
  // but never override what the household later changes in the UI
  // (see seedSettingsFromEnv).
  jwtSecret: process.env.JWT_SECRET || undefined,
  leadDays: process.env.LEAD_DAYS || undefined,
  // Optional EU-leaning locale/currency seeds for the household preferences.
  country: process.env.COUNTRY || undefined,
  defaultCurrency: process.env.DEFAULT_CURRENCY || undefined,
  locale: process.env.LOCALE || undefined,
  timezone: process.env.TZ || undefined,
  language: process.env.LANGUAGE || undefined,
} as const;
