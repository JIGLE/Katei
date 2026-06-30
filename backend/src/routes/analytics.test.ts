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

// A date in the current month so it lands in the analytics window.
const thisMonth = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-15`;
};

test('monthly-spend sums completed payments and prefers the actual amount', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Water', amount: 100, currency: 'EUR', stream_type: 'expense' },
  })).json();

  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Water due', event_type: 'payment', target_date: thisMonth(), money_stream_id: stream.id },
  })).json();

  // Before completion, nothing is counted.
  let series = (await app.inject({ method: 'GET', url: '/api/analytics/monthly-spend?months=1', headers: { cookie } })).json();
  assert.equal(series.at(-1).total, 0);

  // Mark paid with an actual amount that differs from the stream's expected 100.
  await app.inject({
    method: 'PATCH', url: `/api/events/${event.id}`, headers: { cookie },
    payload: { is_completed: true, actual_amount: 142.84 },
  });

  series = (await app.inject({ method: 'GET', url: '/api/analytics/monthly-spend?months=1', headers: { cookie } })).json();
  assert.equal(series.at(-1).total, 142.84, 'should use actual_amount, not the stream expected amount');
});

test('completed payments without an actual amount fall back to the stream amount', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Rent', amount: 1200, currency: 'EUR', stream_type: 'expense' },
  })).json();
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Rent due', event_type: 'payment', target_date: thisMonth(), money_stream_id: stream.id },
  })).json();
  await app.inject({ method: 'PATCH', url: `/api/events/${event.id}/complete`, headers: { cookie }, payload: { is_completed: true } });

  const series = (await app.inject({ method: 'GET', url: '/api/analytics/monthly-spend?months=1', headers: { cookie } })).json();
  assert.equal(series.at(-1).total, 1200);
});
