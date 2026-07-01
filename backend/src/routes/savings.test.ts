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

const putPrefs = (extra: Record<string, unknown>) =>
  app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'DE', currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin', language: 'en', ...extra },
  });

test('a fresh household has a zero savings balance', opts, async () => {
  const s = (await app.inject({ method: 'GET', url: '/api/savings', headers: { cookie } })).json();
  assert.equal(s.opening, 0);
  assert.equal(s.contributed, 0);
  assert.equal(s.balance, 0);
  assert.deepEqual(s.entries, []);
});

test('the opening balance is the savings a household already has', opts, async () => {
  await putPrefs({ savings_opening: 4200 });
  const s = (await app.inject({ method: 'GET', url: '/api/savings', headers: { cookie } })).json();
  assert.equal(s.opening, 4200);
  assert.equal(s.balance, 4200);
});

test('a one-time deposit updates the total (the reported bug)', opts, async () => {
  await putPrefs({ savings_opening: 1000 });
  const posted = (await app.inject({
    method: 'POST', url: '/api/savings/entries', headers: { cookie },
    payload: { amount: 500, note: 'Bonus' },
  })).json();
  assert.equal(posted.balance, 1500);
  assert.equal(posted.contributed, 500);
  assert.equal(posted.entries.length, 1);
  assert.equal(posted.entries[0].note, 'Bonus');
});

test('editing a contribution corrects the balance', opts, async () => {
  const posted = (await app.inject({
    method: 'POST', url: '/api/savings/entries', headers: { cookie },
    payload: { amount: 500, note: 'Bonuss' },
  })).json();
  const id = posted.entries[0].id;
  const edited = (await app.inject({
    method: 'PATCH', url: `/api/savings/entries/${id}`, headers: { cookie },
    payload: { amount: 650, note: 'Bonus' },
  })).json();
  assert.equal(edited.balance, 650);
  assert.equal(edited.entries[0].note, 'Bonus');
  assert.equal(Number(edited.entries[0].amount), 650);
});

test('deleting a contribution reverts the balance', opts, async () => {
  const posted = (await app.inject({
    method: 'POST', url: '/api/savings/entries', headers: { cookie },
    payload: { amount: 300 },
  })).json();
  const after = (await app.inject({
    method: 'DELETE', url: `/api/savings/entries/${posted.entries[0].id}`, headers: { cookie },
  })).json();
  assert.equal(after.balance, 0);
  assert.equal(after.entries.length, 0);
});

test('confirming a recurring savings event posts to the ledger, once', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Emergency fund', amount: 250, stream_type: 'savings' },
  })).json();
  const evt = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Emergency fund', event_type: 'savings', target_date: '2999-01-01', money_stream_id: stream.id },
  })).json();

  await app.inject({ method: 'PATCH', url: `/api/events/${evt.id}/complete`, headers: { cookie }, payload: { is_completed: true } });
  let s = (await app.inject({ method: 'GET', url: '/api/savings', headers: { cookie } })).json();
  assert.equal(s.balance, 250);
  assert.equal(s.entries.length, 1);

  // Re-confirming an already-complete event must not double-post.
  await app.inject({ method: 'PATCH', url: `/api/events/${evt.id}/complete`, headers: { cookie }, payload: { is_completed: true } });
  s = (await app.inject({ method: 'GET', url: '/api/savings', headers: { cookie } })).json();
  assert.equal(s.balance, 250);
  assert.equal(s.entries.length, 1);
});

test('a confirmed savings event uses the actual amount set aside when given', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'House deposit', amount: 200, stream_type: 'savings' },
  })).json();
  const evt = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'House deposit', event_type: 'savings', target_date: '2999-01-01', money_stream_id: stream.id },
  })).json();
  // Capture a larger actual contribution before confirming.
  await app.inject({ method: 'PATCH', url: `/api/events/${evt.id}`, headers: { cookie }, payload: { actual_amount: 350 } });
  await app.inject({ method: 'PATCH', url: `/api/events/${evt.id}/complete`, headers: { cookie }, payload: { is_completed: true } });

  const s = (await app.inject({ method: 'GET', url: '/api/savings', headers: { cookie } })).json();
  assert.equal(s.balance, 350);
});
