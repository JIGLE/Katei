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
  // Budgeting: classify streams and schedule their recurrence.
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS stream_type TEXT NOT NULL DEFAULT 'expense'`);
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS due_day SMALLINT NOT NULL DEFAULT 1`);
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS due_shift TEXT NOT NULL DEFAULT 'next'`);
  // Automated (direct-debit) streams generate no actionable event / reminder.
  await query(`ALTER TABLE money_streams ADD COLUMN IF NOT EXISTS automated BOOLEAN NOT NULL DEFAULT FALSE`);
  // Amount actually paid, captured when a payment is marked paid (bills vary).
  await query(`ALTER TABLE household_events ADD COLUMN IF NOT EXISTS actual_amount DECIMAL(10, 2)`);
  // Per-member roles + one-time invite codes (Phase 2: real household accounts).
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'member'`);
  // Optional email for identity / future recovery.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT`);
  // Non-human members (pets) + birthdays — a household is everyone who lives there.
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'human'`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday DATE`);
  await query(
    `CREATE TABLE IF NOT EXISTS invites (
       id SERIAL PRIMARY KEY,
       code TEXT UNIQUE NOT NULL,
       role VARCHAR(20) NOT NULL DEFAULT 'member',
       created_by INT REFERENCES users(id) ON DELETE SET NULL,
       expires_at TIMESTAMP,
       used_at TIMESTAMP,
       used_by INT REFERENCES users(id) ON DELETE SET NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`,
  );
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
 * Seed a setting only when it is not already present. Used for env-provided
 * defaults so a wiped settings table (or fresh volume) self-heals, while UI
 * changes still persist across restarts instead of being clobbered every boot.
 */
export async function setSettingIfAbsent(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO NOTHING`,
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
 * Seed settings from the environment as initial *defaults* when provided. These
 * are written only if the key is absent (seed-once), so they populate a fresh /
 * wiped settings table but never clobber values the household later changes in
 * the UI — otherwise e.g. TZ (set in most containers) would silently revert the
 * saved timezone on every restart.
 */
export async function seedSettingsFromEnv(): Promise<void> {
  if (config.ntfyUrl) await setSettingIfAbsent('ntfy_url', config.ntfyUrl);
  if (config.leadDays) await setSettingIfAbsent('notify_lead_days', config.leadDays);
  if (config.country) await setSettingIfAbsent('country', config.country);
  if (config.defaultCurrency) await setSettingIfAbsent('default_currency', config.defaultCurrency);
  if (config.locale) await setSettingIfAbsent('locale', config.locale);
  if (config.timezone) await setSettingIfAbsent('timezone', config.timezone);
  if (config.language) await setSettingIfAbsent('language', config.language);
}
