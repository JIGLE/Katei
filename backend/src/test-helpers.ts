// Integration-test harness for the route layer. Builds the real Fastify app and
// drives it with app.inject() against a real Postgres pointed to by DATABASE_URL.
//
// IMPORTANT: this module statically imports db/config, which require DATABASE_URL
// at load time. Test files must therefore import it lazily (inside a `before`
// hook guarded by `process.env.DATABASE_URL`) so the suite skips cleanly — and
// the existing pure unit tests still run — when no database is configured.
//
// setupTestDb() is destructive: it drops and recreates the public schema. Only
// ever point DATABASE_URL at a throwaway/test database.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { pool, migrate } from './db.js';

const TEST_JWT_SECRET = 'integration-test-secret';
const dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dirname, '..', '..', 'schema.sql');

const TABLES = ['assignments', 'activity', 'invites', 'household_events', 'money_streams', 'users', 'app_settings'];

/** Drop + recreate the schema from schema.sql, then apply migrations. Run once. */
export async function setupTestDb(): Promise<void> {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const schema = readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
  await migrate();
}

/** Empty all domain tables between tests. */
export async function truncateAll(): Promise<void> {
  await pool.query(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
}

export async function makeApp(): Promise<FastifyInstance> {
  return buildApp({ jwtSecret: TEST_JWT_SECRET, logger: false, serveStatic: false });
}

/** Release the shared pool so the test process can exit. */
export async function closePool(): Promise<void> {
  await pool.end();
}

/** Extract the session cookie from an inject() response as a Cookie header value. */
export function sessionCookie(res: { cookies: { name: string; value: string }[] }): string {
  const c = res.cookies.find((x) => x.name === 'katei_session');
  if (!c) throw new Error('no session cookie set on response');
  return `katei_session=${c.value}`;
}

/** Register the first household account and return its session Cookie header. */
export async function registerAndLogin(
  app: FastifyInstance,
  name = 'Sam',
  password = 'password123',
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { name, password },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  return sessionCookie(res);
}
