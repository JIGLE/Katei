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

const make = (over: Record<string, unknown> = {}) => ({
  title: 'Dentist', event_type: 'appointment', target_date: '2999-01-01', ...over,
});

test('creates and lists events', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make() });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().title, 'Dentist');

  const list = await app.inject({ method: 'GET', url: '/api/events', headers: { cookie } });
  assert.equal(list.json().length, 1);
});

test('rejects an invalid event_type', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ event_type: 'bogus' }) });
  assert.equal(res.statusCode, 400);
});

test('upcoming filter excludes past and completed events', opts, async () => {
  await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ title: 'Future', target_date: '2999-01-01' }) });
  await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ title: 'Past', target_date: '2000-01-01' }) });

  const upcoming = (await app.inject({ method: 'GET', url: '/api/events?upcoming=true', headers: { cookie } })).json();
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].title, 'Future');
});

test('toggles completion', opts, async () => {
  const created = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make() })).json();
  const res = await app.inject({
    method: 'PATCH', url: `/api/events/${created.id}/complete`, headers: { cookie },
    payload: { is_completed: true },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().is_completed, true);
});

test('deletes an event and 404s afterwards', opts, async () => {
  const created = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make() })).json();
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/events/${created.id}`, headers: { cookie } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: `/api/events/${created.id}`, headers: { cookie } })).statusCode, 404);
});
