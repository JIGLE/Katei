import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let app: FastifyInstance;
let cookie: string; // Alex, admin

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  await h.setupTestDb();
  app = await h.makeApp();
});
beforeEach(async () => {
  if (!dbAvailable) return;
  await h.truncateAll();
  cookie = await h.registerAndLogin(app, 'Alex');
});
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

/** Invite + join Robin, returning their id and non-admin session. */
async function joinRobin(): Promise<{ id: number; session: string }> {
  const invite = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie }, payload: {} })).json();
  const join = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Robin', password: 'password123', invite_code: invite.code },
  });
  assert.equal(join.statusCode, 201);
  return { id: join.json().id ?? join.json().user?.id, session: h.sessionCookie(join) };
}

test('requires authentication', opts, async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/gifts' })).statusCode, 401);
});

test('a gift is invisible to its recipient on every verb, and counted', opts, async () => {
  const robin = await joinRobin();
  const gift = (await app.inject({
    method: 'POST', url: '/api/gifts', headers: { cookie },
    payload: { recipient_id: robin.id, title: 'Record player', url: 'https://example.com/rp', link_site: 'example.com', price: 129.5 },
  })).json();
  assert.equal(gift.recipient_name, 'Robin');

  // Alex (the giver) sees it.
  const forAlex = (await app.inject({ method: 'GET', url: '/api/gifts', headers: { cookie } })).json();
  assert.equal(forAlex.items.length, 1);
  assert.equal(forAlex.hidden_for_you, 0);

  // Robin sees nothing but knows one is hidden.
  const forRobin = (await app.inject({ method: 'GET', url: '/api/gifts', headers: { cookie: robin.session } })).json();
  assert.equal(forRobin.items.length, 0);
  assert.equal(forRobin.hidden_for_you, 1);

  // Probing by id gives the recipient the same 404 an unknown id would.
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/gifts/${gift.id}`, headers: { cookie: robin.session }, payload: { title: 'X' } })).statusCode, 404);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/gifts/${gift.id}`, headers: { cookie: robin.session } })).statusCode, 404);
});

test('currency defaults to the household currency; status flips to bought', opts, async () => {
  await app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'DK', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen' },
  });
  const robin = await joinRobin();
  const gift = (await app.inject({
    method: 'POST', url: '/api/gifts', headers: { cookie },
    payload: { recipient_id: robin.id, title: 'Scarf', price: 200 },
  })).json();
  assert.equal(gift.currency, 'DKK');

  const bought = (await app.inject({ method: 'PATCH', url: `/api/gifts/${gift.id}`, headers: { cookie }, payload: { status: 'bought' } })).json();
  assert.equal(bought.status, 'bought');
});

test('gift changes write no activity-feed entry (surprises survive the Overview)', opts, async () => {
  const robin = await joinRobin();
  await app.inject({
    method: 'POST', url: '/api/gifts', headers: { cookie },
    payload: { recipient_id: robin.id, title: 'Telescope' },
  });
  const acts = (await app.inject({ method: 'GET', url: '/api/activity?limit=10', headers: { cookie } })).json();
  assert.ok(!acts.some((a: { summary: string }) => a.summary === 'Telescope'));
});
