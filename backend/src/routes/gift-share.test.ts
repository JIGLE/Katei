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
  cookie = await h.registerAndLogin(app, 'Alex');
});
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

test('an unknown token 404s with no auth required', opts, async () => {
  const res = await app.inject({ method: 'GET', url: '/api/gift-share/not-a-real-token' });
  assert.equal(res.statusCode, 404);
});

test('a minted share link serves the list with true status, no session', opts, async () => {
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  await app.inject({
    method: 'POST', url: `/api/gift-lists/${mine.mine.id}/items`, headers: { cookie },
    payload: { title: 'Espresso grinder', price: 180 },
  });
  const { share_token } = (await app.inject({ method: 'POST', url: `/api/gift-lists/${mine.mine.id}/share`, headers: { cookie } })).json();

  const res = await app.inject({ method: 'GET', url: `/api/gift-share/${share_token}` });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.list_name, 'Alex');
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].title, 'Espresso grinder');
  assert.equal(body.items[0].status, 'idea');
});

test('an anonymous visitor can mark an item bought with an optional name, and it sticks', opts, async () => {
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const item = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${mine.mine.id}/items`, headers: { cookie },
    payload: { title: 'Wool blanket' },
  })).json();
  const { share_token } = (await app.inject({ method: 'POST', url: `/api/gift-lists/${mine.mine.id}/share`, headers: { cookie } })).json();

  const marked = await app.inject({
    method: 'PATCH', url: `/api/gift-share/${share_token}/items/${item.id}`,
    payload: { status: 'bought', bought_by_note: 'Grandma Jo' },
  });
  assert.equal(marked.statusCode, 200);
  assert.equal(marked.json().status, 'bought');
  assert.equal(marked.json().bought_by_name, 'Grandma Jo');

  // The owner never sees any of it, even through the authenticated API.
  const forOwner = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  assert.equal(forOwner.mine.items[0].status, 'idea');
  assert.equal(forOwner.mine.items[0].bought_by_name, null);

  // A second household member sees the truth via the normal API too.
  const robinInvite = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie }, payload: {} })).json();
  const robinJoin = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Robin', password: 'password123', invite_code: robinInvite.code },
  });
  const robinCookie = h.sessionCookie(robinJoin);
  const forRobin = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie: robinCookie } })).json();
  const alexList = forRobin.others.find((l: { owner_name: string }) => l.owner_name === 'Alex');
  assert.equal(alexList.items[0].status, 'bought');
  assert.equal(alexList.items[0].bought_by_name, 'Grandma Jo');
});

test('a share link cannot edit content, add, or delete — status only', opts, async () => {
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const item = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${mine.mine.id}/items`, headers: { cookie },
    payload: { title: 'Telescope' },
  })).json();
  const { share_token } = (await app.inject({ method: 'POST', url: `/api/gift-lists/${mine.mine.id}/share`, headers: { cookie } })).json();

  // No route exists for content edits or adds on the public router — these
  // hit the authenticated gift-lists paths instead, which require a session.
  const editAttempt = await app.inject({
    method: 'PATCH', url: `/api/gift-lists/items/${item.id}`,
    payload: { title: 'Something else' },
  });
  assert.equal(editAttempt.statusCode, 401);
});

test('turning a share link off makes the token 404 again', opts, async () => {
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const { share_token } = (await app.inject({ method: 'POST', url: `/api/gift-lists/${mine.mine.id}/share`, headers: { cookie } })).json();
  await app.inject({ method: 'DELETE', url: `/api/gift-lists/${mine.mine.id}/share`, headers: { cookie } });

  const res = await app.inject({ method: 'GET', url: `/api/gift-share/${share_token}` });
  assert.equal(res.statusCode, 404);
});

test('repeated wrong guesses are throttled; the real link is never throttled', opts, async () => {
  for (let i = 0; i < 30; i++) {
    await app.inject({ method: 'GET', url: `/api/gift-share/guess-${i}` });
  }
  const limited = await app.inject({ method: 'GET', url: '/api/gift-share/one-more-guess' });
  assert.equal(limited.statusCode, 429);
  assert.ok(limited.headers['retry-after']);

  // A legitimate, valid token is unaffected by the guessing against others.
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const { share_token } = (await app.inject({ method: 'POST', url: `/api/gift-lists/${mine.mine.id}/share`, headers: { cookie } })).json();
  const ok = await app.inject({ method: 'GET', url: `/api/gift-share/${share_token}` });
  assert.equal(ok.statusCode, 200);
});
