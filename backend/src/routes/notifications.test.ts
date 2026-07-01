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

// checkAndNotify is exercised via a due, unassigned event → a household-wide
// in-app notification for the (single) account, independent of any ntfy config.
async function runSweep() {
  const { checkAndNotify } = await import('../lib/notifications.js');
  return checkAndNotify();
}

test('a due event raises an in-app notification for the household', opts, async () => {
  await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Water bill', event_type: 'payment', target_date: new Date().toISOString().slice(0, 10) },
  });
  await runSweep();

  const feed = (await app.inject({ method: 'GET', url: '/api/notifications', headers: { cookie } })).json();
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].title, 'Water bill');
  assert.equal(feed.unread, 1);
});

test('marking read clears the unread count', opts, async () => {
  await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Rent', event_type: 'payment', target_date: new Date().toISOString().slice(0, 10) },
  });
  await runSweep();
  await app.inject({ method: 'POST', url: '/api/notifications/read', headers: { cookie }, payload: {} });

  const feed = (await app.inject({ method: 'GET', url: '/api/notifications', headers: { cookie } })).json();
  assert.equal(feed.unread, 0);
  assert.equal(feed.items.length, 1); // read, but still listed
});

test('a far-future event does not notify yet', opts, async () => {
  await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Passport renewal', event_type: 'deadline', target_date: '2999-01-01' },
  });
  await runSweep();
  const feed = (await app.inject({ method: 'GET', url: '/api/notifications', headers: { cookie } })).json();
  assert.equal(feed.items.length, 0);
});
