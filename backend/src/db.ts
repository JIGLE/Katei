// PostgreSQL access layer — a single shared connection pool (node-postgres).
// Domain routers import `query` for parameterised SQL against schema.sql.

import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { config } from './config.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Run a parameterised query against the pool.
 * @example query<{ id: number }>('SELECT id FROM users WHERE id = $1', [1])
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** Verify connectivity at boot; throws if the database is unreachable. */
export async function verifyConnection(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

/**
 * Idempotent schema migrations applied at startup. schema.sql only runs when
 * the database is first created, so changes to existing deployments live here.
 */
export async function migrate(): Promise<void> {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`);
  // Per-member notification URL — reminders for a member's assignments go here.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS ntfy_url TEXT`);
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
  );
  // Timestamp a reminder was sent for an event, so we don't notify twice.
  await query(`ALTER TABLE household_events ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP`);
}

/** Read a single app setting, or null if unset. */
export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = $1`,
    [key],
  );
  return rows[0]?.value ?? null;
}

/** Upsert a single app setting. */
export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
}

/**
 * Fetch the JWT signing secret. If JWT_SECRET is set in the environment it is
 * authoritative (upserted every boot) so sessions survive a wiped settings
 * table or fresh volume. Otherwise a random secret is generated and persisted
 * once, so zero-config deployments still keep sessions across restarts.
 */
export async function getOrCreateAuthSecret(): Promise<string> {
  if (config.jwtSecret) {
    await setSetting('auth_secret', config.jwtSecret);
    return config.jwtSecret;
  }
  const secret = randomBytes(48).toString('hex');
  await query(
    `INSERT INTO app_settings (key, value) VALUES ('auth_secret', $1)
     ON CONFLICT (key) DO NOTHING`,
    [secret],
  );
  const { rows } = await query<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'auth_secret'`,
  );
  return rows[0].value;
}

/**
 * Seed notification settings from the environment when provided. NTFY_URL and
 * LEAD_DAYS are upserted on boot so they survive a wiped settings table. When
 * unset, the UI-managed values are left untouched.
 */
export async function seedSettingsFromEnv(): Promise<void> {
  if (config.ntfyUrl) await setSetting('ntfy_url', config.ntfyUrl);
  if (config.leadDays) await setSetting('notify_lead_days', config.leadDays);
  if (config.country) await setSetting('country', config.country);
  if (config.defaultCurrency) await setSetting('default_currency', config.defaultCurrency);
  if (config.locale) await setSetting('locale', config.locale);
  if (config.timezone) await setSetting('timezone', config.timezone);
}
