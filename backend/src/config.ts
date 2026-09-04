// Centralised environment configuration for the Katei API.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
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
  // Comma-separated origins allowed to make credentialed cross-origin API
  // calls. Empty (the default) means same-origin only — correct for the
  // single-image deployment where the SPA is served by this server.
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  leadDays: process.env.LEAD_DAYS || undefined,
  // Optional EU-leaning locale/currency seeds for the household preferences.
  country: process.env.COUNTRY || undefined,
  defaultCurrency: process.env.DEFAULT_CURRENCY || undefined,
  locale: process.env.LOCALE || undefined,
  timezone: process.env.TZ || undefined,
  language: process.env.LANGUAGE || undefined,
  graphitiUrl: process.env.GRAPHITI_URL?.replace(/\/+$/, '') || undefined,
  graphitiApiKey: process.env.GRAPHITI_API_KEY || undefined,
  graphitiTimeoutMs: positiveInt('GRAPHITI_TIMEOUT_MS', 2000),
} as const;
