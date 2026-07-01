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

test('adding a money stream logs stream_added activity', opts, async () => {
  await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Rent', amount: 1200, stream_type: 'expense' },
  });
  const feed = (await app.inject({ method: 'GET', url: '/api/activity', headers: { cookie } })).json();
  assert.equal(feed.length, 1);
  assert.equal(feed[0].action, 'stream_added');
  assert.equal(feed[0].summary, 'Rent');
  assert.equal(feed[0].actor_name, 'Sam');
});

test('adding a member logs member_added activity', opts, async () => {
  await app.inject({
    method: 'POST', url: '/api/users', headers: { cookie },
    payload: { name: 'Mochi', kind: 'pet' },
  });
  const feed = (await app.inject({ method: 'GET', url: '/api/activity', headers: { cookie } })).json();
  assert.equal(feed.some((a: { action: string; summary: string }) => a.action === 'member_added' && a.summary === 'Mochi'), true);
});

test('completing a payment logs payment_paid, other events log event_done', opts, async () => {
  const payment = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Water', event_type: 'payment', target_date: '2999-01-01' },
  })).json();
  const chore = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Dentist', event_type: 'appointment', target_date: '2999-01-01' },
  })).json();

  await app.inject({ method: 'PATCH', url: `/api/events/${payment.id}/complete`, headers: { cookie }, payload: { is_completed: true } });
  await app.inject({ method: 'PATCH', url: `/api/events/${chore.id}/complete`, headers: { cookie }, payload: { is_completed: true } });

  const feed = (await app.inject({ method: 'GET', url: '/api/activity', headers: { cookie } })).json();
  const actions = feed.map((a: { action: string }) => a.action);
  assert.equal(actions.includes('payment_paid'), true);
  assert.equal(actions.includes('event_done'), true);
});

test('un-completing an event does not log activity', opts, async () => {
  const chore = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Dishes', event_type: 'appointment', target_date: '2999-01-01' },
  })).json();
  // Complete then un-complete; only the completion should be recorded.
  await app.inject({ method: 'PATCH', url: `/api/events/${chore.id}/complete`, headers: { cookie }, payload: { is_completed: true } });
  await app.inject({ method: 'PATCH', url: `/api/events/${chore.id}/complete`, headers: { cookie }, payload: { is_completed: false } });

  const feed = (await app.inject({ method: 'GET', url: '/api/activity', headers: { cookie } })).json();
  const done = feed.filter((a: { action: string }) => a.action === 'event_done');
  assert.equal(done.length, 1);
});

test('feed is newest-first and respects the limit param', opts, async () => {
  for (const n of ['A', 'B', 'C']) {
    await app.inject({ method: 'POST', url: '/api/money-streams', headers: { cookie }, payload: { name: n, amount: 1 } });
  }
  const limited = (await app.inject({ method: 'GET', url: '/api/activity?limit=2', headers: { cookie } })).json();
  assert.equal(limited.length, 2);
  // Most recent stream ('C') comes first.
  assert.equal(limited[0].summary, 'C');
});
