import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let app: FastifyInstance;
let cookie: string;

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  await h.setupTestDb();
  app = await h.makeApp();
});
beforeEach(async () => {
  if (!dbAvailable) return;
  await h.truncateAll();
  cookie = await h.registerAndLogin(app);
});
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

test('the avatar serve route rejects unsafe names and 404s unknown files', opts, async () => {
  const bad = await app.inject({ method: 'GET', url: '/api/avatars/..%2f..%2fetc%2fpasswd', headers: { cookie } });
  assert.equal(bad.statusCode, 400);
  const missing = await app.inject({ method: 'GET', url: '/api/avatars/9_1_deadbeef.png', headers: { cookie } });
  assert.equal(missing.statusCode, 404);
});
