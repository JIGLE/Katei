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
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     )`,
  );
}

/**
 * Fetch the JWT signing secret, generating and persisting one on first use so
 * sessions survive restarts without requiring the operator to set an env var.
 */
export async function getOrCreateAuthSecret(): Promise<string> {
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
