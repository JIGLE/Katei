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

test('settings returns a calendar token; a wrong token 404s', opts, async () => {
  const { token } = (await app.inject({ method: 'GET', url: '/api/settings/calendar', headers: { cookie } })).json();
  assert.ok(token && token.length > 10);

  assert.equal((await app.inject({ method: 'GET', url: '/api/calendar/not-the-token.ics' })).statusCode, 404);
});

test('the token feed serves iCalendar with the household events, no auth', opts, async () => {
  await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Rent due', event_type: 'payment', target_date: '2999-01-01' },
  });
  const { token } = (await app.inject({ method: 'GET', url: '/api/settings/calendar', headers: { cookie } })).json();

  // No cookie — a calendar app can't send one.
  const res = await app.inject({ method: 'GET', url: `/api/calendar/${token}.ics` });
  assert.equal(res.statusCode, 200);
  assert.match(res.headers['content-type'] as string, /text\/calendar/);
  assert.ok(res.body.includes('BEGIN:VCALENDAR'));
  assert.ok(res.body.includes('SUMMARY:Rent due'));
});

test('rotating the token invalidates the old feed URL', opts, async () => {
  const { token: oldToken } = (await app.inject({ method: 'GET', url: '/api/settings/calendar', headers: { cookie } })).json();
  const { token: newToken } = (await app.inject({ method: 'POST', url: '/api/settings/calendar/rotate', headers: { cookie } })).json();
  assert.notEqual(oldToken, newToken);
  assert.equal((await app.inject({ method: 'GET', url: `/api/calendar/${oldToken}.ics` })).statusCode, 404);
  assert.equal((await app.inject({ method: 'GET', url: `/api/calendar/${newToken}.ics` })).statusCode, 200);
});
