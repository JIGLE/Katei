import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let app: FastifyInstance;

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  await h.setupTestDb();
  app = await h.makeApp();
});
beforeEach(async () => { if (dbAvailable) await h.truncateAll(); });
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

test('status reports needsSetup before any account, then false after register', opts, async () => {
  let res = await app.inject({ method: 'GET', url: '/api/auth/status' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().needsSetup, true);

  res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Sam', password: 'password123' } });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().name, 'Sam');
  assert.ok(res.cookies.find((c) => c.name === 'katei_session'));

  res = await app.inject({ method: 'GET', url: '/api/auth/status' });
  assert.equal(res.json().needsSetup, false);
});

test('me requires a session cookie', opts, async () => {
  const cookie = await h.registerAndLogin(app, 'Sam', 'password123');

  let res = await app.inject({ method: 'GET', url: '/api/auth/me' });
  assert.equal(res.statusCode, 401);

  res = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().name, 'Sam');
});

test('login rejects a wrong password and accepts the right one', opts, async () => {
  await h.registerAndLogin(app, 'Sam', 'password123');

  let res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'wrong' } });
  assert.equal(res.statusCode, 401);

  res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'password123' } });
  assert.equal(res.statusCode, 200);
  assert.ok(res.cookies.find((c) => c.name === 'katei_session'));
});

test('register is closed once setup is done (requires auth)', opts, async () => {
  await h.registerAndLogin(app, 'Sam', 'password123');
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Alex', password: 'password123' } });
  assert.equal(res.statusCode, 403);
});

test('register validates a minimum password length', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Sam', password: 'short' } });
  assert.equal(res.statusCode, 400);
});
