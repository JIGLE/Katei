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
  assert.equal((await app.inject({ method: 'GET', url: '/api/shopping' })).statusCode, 401);
});

test('adds, lists, checks off, and orders open-before-done', opts, async () => {
  const milk = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Milk' } })).json();
  await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Bread', note: 'sourdough' } });
  assert.equal(milk.is_done, false);

  const done = await app.inject({ method: 'PATCH', url: `/api/shopping/${milk.id}`, headers: { cookie }, payload: { is_done: true } });
  assert.equal(done.json().is_done, true);
  assert.ok(done.json().done_at);

  const list = (await app.inject({ method: 'GET', url: '/api/shopping', headers: { cookie } })).json();
  assert.deepEqual(list.map((i: { name: string }) => i.name), ['Bread', 'Milk']); // open first
});

test('unchecking clears done_at', opts, async () => {
  const item = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Eggs' } })).json();
  await app.inject({ method: 'PATCH', url: `/api/shopping/${item.id}`, headers: { cookie }, payload: { is_done: true } });
  const back = (await app.inject({ method: 'PATCH', url: `/api/shopping/${item.id}`, headers: { cookie }, payload: { is_done: false } })).json();
  assert.equal(back.is_done, false);
  assert.equal(back.done_at, null);
});

test('clear-done removes only checked items', opts, async () => {
  const a = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Rice' } })).json();
  await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Beans' } });
  await app.inject({ method: 'PATCH', url: `/api/shopping/${a.id}`, headers: { cookie }, payload: { is_done: true } });

  const res = (await app.inject({ method: 'POST', url: '/api/shopping/clear-done', headers: { cookie } })).json();
  assert.equal(res.cleared, 1);
  const list = (await app.inject({ method: 'GET', url: '/api/shopping', headers: { cookie } })).json();
  assert.deepEqual(list.map((i: { name: string }) => i.name), ['Beans']);
});

test('adding logs household activity', opts, async () => {
  await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Coffee' } });
  const acts = (await app.inject({ method: 'GET', url: '/api/activity?limit=3', headers: { cookie } })).json();
  assert.ok(acts.some((a: { action: string; summary: string }) => a.action === 'shopping_added' && a.summary === 'Coffee'));
});

test('deleting an unknown item is a 404', opts, async () => {
  assert.equal((await app.inject({ method: 'DELETE', url: '/api/shopping/9999', headers: { cookie } })).statusCode, 404);
});

test('reorder persists a new sort_order', opts, async () => {
  const a = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Apples' } })).json();
  const b = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Bananas' } })).json();
  const c = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Cherries' } })).json();

  const res = await app.inject({
    method: 'POST', url: '/api/shopping/reorder', headers: { cookie },
    payload: { ids: [c.id, a.id, b.id] },
  });
  assert.equal(res.statusCode, 200);

  const list = (await app.inject({ method: 'GET', url: '/api/shopping', headers: { cookie } })).json();
  assert.deepEqual(list.map((i: { name: string }) => i.name), ['Cherries', 'Apples', 'Bananas']);
});

test('reorder rejects an empty ids array', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/shopping/reorder', headers: { cookie }, payload: { ids: [] } });
  assert.equal(res.statusCode, 400);
});

test('store is settable on add and edit, and defaults to null', opts, async () => {
  const noStore = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Batteries' } })).json();
  assert.equal(noStore.store, null);

  const tagged = (await app.inject({ method: 'POST', url: '/api/shopping', headers: { cookie }, payload: { name: 'Meatballs', store: 'IKEA' } })).json();
  assert.equal(tagged.store, 'IKEA');

  const retagged = (await app.inject({ method: 'PATCH', url: `/api/shopping/${noStore.id}`, headers: { cookie }, payload: { store: 'Groceries' } })).json();
  assert.equal(retagged.store, 'Groceries');

  const cleared = (await app.inject({ method: 'PATCH', url: `/api/shopping/${tagged.id}`, headers: { cookie }, payload: { store: null } })).json();
  assert.equal(cleared.store, null);
});
