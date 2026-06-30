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

test('requires authentication', opts, async () => {
  const res = await app.inject({ method: 'GET', url: '/api/money-streams' });
  assert.equal(res.statusCode, 401);
});

test('creates an expense with sane defaults and lists it', opts, async () => {
  const res = await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Rent', amount: 1200, currency: 'EUR', stream_type: 'expense', frequency: 'monthly' },
  });
  assert.equal(res.statusCode, 201);
  const s = res.json();
  assert.equal(s.name, 'Rent');
  assert.equal(s.stream_type, 'expense');
  assert.equal(s.automated, false);
  assert.equal(s.due_shift, 'next');

  const list = await app.inject({ method: 'GET', url: '/api/money-streams', headers: { cookie } });
  assert.equal(list.json().length, 1);
});

test('patches an amount', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Rent', amount: 1200, currency: 'EUR' },
  })).json();

  const res = await app.inject({
    method: 'PATCH', url: `/api/money-streams/${created.id}`, headers: { cookie },
    payload: { amount: 1300 },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(Number(res.json().amount), 1300);
});

test('switching a stream to automated retires its pending event', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Internet', amount: 40, currency: 'EUR', stream_type: 'expense', frequency: 'monthly' },
  })).json();

  // A pending payment obligation linked to the stream.
  await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Internet due', event_type: 'payment', target_date: '2999-01-01', money_stream_id: stream.id },
  });
  let events = (await app.inject({ method: 'GET', url: '/api/events', headers: { cookie } })).json();
  assert.equal(events.length, 1);

  await app.inject({
    method: 'PATCH', url: `/api/money-streams/${stream.id}`, headers: { cookie },
    payload: { automated: true },
  });

  events = (await app.inject({ method: 'GET', url: '/api/events', headers: { cookie } })).json();
  assert.equal(events.length, 0, 'automating the stream should delete its pending payment event');
});

test('deletes a stream', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Rent', amount: 1200, currency: 'EUR' },
  })).json();

  const del = await app.inject({ method: 'DELETE', url: `/api/money-streams/${created.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  const list = await app.inject({ method: 'GET', url: '/api/money-streams', headers: { cookie } });
  assert.equal(list.json().length, 0);
});
