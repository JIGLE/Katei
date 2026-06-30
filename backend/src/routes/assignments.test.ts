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
  cookie = await h.registerAndLogin(app); // creates user id 1
});
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

test('assigns a user to an event and lists with the joined user name', opts, async () => {
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Dentist', event_type: 'appointment', target_date: '2999-01-01' },
  })).json();

  const created = await app.inject({
    method: 'POST', url: '/api/assignments', headers: { cookie },
    payload: { user_id: 1, event_id: event.id, role: 'owner' },
  });
  assert.equal(created.statusCode, 201);
  assert.equal(created.json().role, 'owner');

  const list = (await app.inject({ method: 'GET', url: '/api/assignments', headers: { cookie } })).json();
  assert.equal(list.length, 1);
  assert.equal(list[0].user_name, 'Sam');
  assert.equal(list[0].event_id, event.id);
});

test('filters assignments by event_id', opts, async () => {
  const e1 = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: { title: 'A', event_type: 'deadline', target_date: '2999-01-01' } })).json();
  const e2 = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: { title: 'B', event_type: 'deadline', target_date: '2999-01-02' } })).json();
  await app.inject({ method: 'POST', url: '/api/assignments', headers: { cookie }, payload: { user_id: 1, event_id: e1.id } });
  await app.inject({ method: 'POST', url: '/api/assignments', headers: { cookie }, payload: { user_id: 1, event_id: e2.id } });

  const only = (await app.inject({ method: 'GET', url: `/api/assignments?event_id=${e1.id}`, headers: { cookie } })).json();
  assert.equal(only.length, 1);
  assert.equal(only[0].event_id, e1.id);
});

test('deletes an assignment', opts, async () => {
  const event = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: { title: 'Dentist', event_type: 'appointment', target_date: '2999-01-01' } })).json();
  const a = (await app.inject({ method: 'POST', url: '/api/assignments', headers: { cookie }, payload: { user_id: 1, event_id: event.id } })).json();

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/assignments/${a.id}`, headers: { cookie } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/api/assignments', headers: { cookie } })).json().length, 0);
});
