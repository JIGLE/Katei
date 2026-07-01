import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let db: typeof import('../db.js');
let app: FastifyInstance;
let cookie: string;

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  db = await import('../db.js');
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

const sub = {
  endpoint: 'https://push.example.com/abc',
  keys: { p256dh: 'BPk_key', auth: 'authsecret' },
};

test('the VAPID public key is available and stable', opts, async () => {
  const a = (await app.inject({ method: 'GET', url: '/api/push/vapid', headers: { cookie } })).json();
  assert.ok(a.publicKey && a.publicKey.length > 20);
  const b = (await app.inject({ method: 'GET', url: '/api/push/vapid', headers: { cookie } })).json();
  assert.equal(a.publicKey, b.publicKey); // persisted, not regenerated
});

test('subscribing stores the device and is idempotent', opts, async () => {
  assert.equal((await app.inject({ method: 'POST', url: '/api/push/subscribe', headers: { cookie }, payload: sub })).statusCode, 201);
  // Re-subscribing the same endpoint upserts rather than duplicating.
  await app.inject({ method: 'POST', url: '/api/push/subscribe', headers: { cookie }, payload: sub });
  const { rows } = await db.query('SELECT count(*)::int AS n FROM push_subscriptions');
  assert.equal(rows[0].n, 1);
});

test('unsubscribing forgets the device', opts, async () => {
  await app.inject({ method: 'POST', url: '/api/push/subscribe', headers: { cookie }, payload: sub });
  await app.inject({ method: 'POST', url: '/api/push/unsubscribe', headers: { cookie }, payload: { endpoint: sub.endpoint } });
  const { rows } = await db.query('SELECT count(*)::int AS n FROM push_subscriptions');
  assert.equal(rows[0].n, 0);
});

test('a test push with no subscribed device returns a clear 400', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/settings/notifications/test', headers: { cookie }, payload: {} });
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /subscribed/i);
});
