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

/** Invite + join a member under the given name, returning their id and session. */
async function join(name: string): Promise<{ id: number; session: string }> {
  const invite = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie }, payload: {} })).json();
  const res = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name, password: 'password123', invite_code: invite.code },
  });
  assert.equal(res.statusCode, 201);
  return { id: res.json().id ?? res.json().user?.id, session: h.sessionCookie(res) };
}

/** A member's own gift-lists id (fetching as them lazily creates it). */
async function ownListId(session: string): Promise<number> {
  const res = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie: session } })).json();
  return res.mine.id;
}

test('requires authentication', opts, async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/gift-lists' })).statusCode, 401);
});

test('a member\'s own wishlist is lazily created and starts empty', opts, async () => {
  const res = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  assert.equal(res.mine.is_mine, true);
  assert.equal(res.mine.owner_name, 'Alex');
  assert.deepEqual(res.mine.items, []);
  assert.deepEqual(res.others, []);
});

test('a member can add an idea for someone who has never opened Gifts themselves', opts, async () => {
  // Robin is invited but never logs in or calls GET — their gift_lists row
  // doesn't exist yet from their own action.
  const inviteRes = await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie }, payload: {} });
  const invite = inviteRes.json();
  const joinRes = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Robin', password: 'password123', invite_code: invite.code },
  });
  // Robin's session exists but is discarded — never used to call the API.
  void joinRes;

  const forAlex = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const robinsList = forAlex.others.find((l) => l.owner_name === 'Robin');
  assert.ok(robinsList, 'Robin should already have a list, backfilled by Alex\'s own GET');

  const added = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${robinsList.id}/items`, headers: { cookie },
    payload: { title: 'Hiking poles' },
  })).json();
  assert.equal(added.title, 'Hiking poles');
});

test('the owner always sees their own items as untouched ideas with no attribution', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);

  const added = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${listId}/items`, headers: { cookie },
    payload: { title: 'Record player', url: 'https://example.com/rp', link_site: 'example.com', price: 129.5 },
  })).json();

  // Alex (non-owner of Robin's list) sees the truth, including who added it.
  const forAlex = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const robinsListForAlex = forAlex.others.find((l: { id: number }) => l.id === listId);
  assert.equal(robinsListForAlex.items.length, 1);
  assert.equal(robinsListForAlex.items[0].status, 'idea');
  assert.equal(robinsListForAlex.items[0].added_by_name, 'Alex');

  // Alex marks it bought.
  await app.inject({
    method: 'PATCH', url: `/api/gift-lists/items/${added.id}`, headers: { cookie },
    payload: { status: 'bought' },
  });
  const afterBought = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const boughtItem = afterBought.others.find((l: { id: number }) => l.id === listId).items[0];
  assert.equal(boughtItem.status, 'bought');
  assert.equal(boughtItem.bought_by_name, 'Alex');

  // Robin (the owner) never sees any of this — status forced to idea, both
  // attribution fields masked — regardless of the true DB state.
  const forRobin = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie: robin.session } })).json();
  assert.equal(forRobin.mine.items.length, 1);
  assert.equal(forRobin.mine.items[0].status, 'idea');
  assert.equal(forRobin.mine.items[0].added_by_name, null);
  assert.equal(forRobin.mine.items[0].bought_by_name, null);
  // Title/price/link are still true — only status/attribution are masked.
  assert.equal(forRobin.mine.items[0].title, 'Record player');
  assert.equal(forRobin.mine.items[0].price, '129.50');
});

test('an owner cannot mark their own gift, even by probing the item id directly', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);
  const added = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${listId}/items`, headers: { cookie },
    payload: { title: 'Telescope' },
  })).json();

  const res = await app.inject({
    method: 'PATCH', url: `/api/gift-lists/items/${added.id}`, headers: { cookie: robin.session },
    payload: { status: 'bought' },
  });
  assert.equal(res.statusCode, 403);

  // The rejection is for the whole request — no silent partial-apply.
  const forAlex = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  assert.equal(forAlex.others.find((l: { id: number }) => l.id === listId).items[0].status, 'idea');
});

test('the owner may still edit content (not status) on their own items', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);
  const added = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${listId}/items`, headers: { cookie },
    payload: { title: 'Telescope' },
  })).json();

  const renamed = await app.inject({
    method: 'PATCH', url: `/api/gift-lists/items/${added.id}`, headers: { cookie: robin.session },
    payload: { title: 'Telescope (the good one)' },
  });
  assert.equal(renamed.statusCode, 200);
  assert.equal(renamed.json().title, 'Telescope (the good one)');
});

test('currency defaults to the household currency', opts, async () => {
  await app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'DK', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen' },
  });
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const gift = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${mine.mine.id}/items`, headers: { cookie },
    payload: { title: 'Scarf', price: 200 },
  })).json();
  assert.equal(gift.currency, 'DKK');
});

test('gift changes write no activity-feed entry (surprises survive the Overview)', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);
  const added = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${listId}/items`, headers: { cookie },
    payload: { title: 'Espresso grinder' },
  })).json();
  await app.inject({
    method: 'PATCH', url: `/api/gift-lists/items/${added.id}`, headers: { cookie },
    payload: { status: 'bought' },
  });
  const acts = (await app.inject({ method: 'GET', url: '/api/activity?limit=10', headers: { cookie } })).json();
  assert.ok(!acts.some((a: { summary: string }) => a.summary === 'Espresso grinder'));
});

test('a list for someone outside the household: create, rename, delete', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/gift-lists', headers: { cookie },
    payload: { external_name: 'Lisa (friend)' },
  })).json();
  assert.equal(created.external_name, 'Lisa (friend)');
  assert.equal(created.is_mine, false);

  const renamed = (await app.inject({
    method: 'PATCH', url: `/api/gift-lists/${created.id}`, headers: { cookie },
    payload: { external_name: 'Lisa (Mum\'s friend)' },
  })).json();
  assert.equal(renamed.external_name, 'Lisa (Mum\'s friend)');

  const del = await app.inject({ method: 'DELETE', url: `/api/gift-lists/${created.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);
});

test('a member\'s own list cannot be renamed or deleted as if it were external', opts, async () => {
  const mine = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const renameAttempt = await app.inject({
    method: 'PATCH', url: `/api/gift-lists/${mine.mine.id}`, headers: { cookie },
    payload: { external_name: 'Someone else' },
  });
  assert.equal(renameAttempt.statusCode, 400);

  const deleteAttempt = await app.inject({ method: 'DELETE', url: `/api/gift-lists/${mine.mine.id}`, headers: { cookie } });
  assert.equal(deleteAttempt.statusCode, 400);
});

test('share link: off by default; a plain non-owner household member is refused with 404', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);

  const before = (await app.inject({ method: 'GET', url: `/api/gift-lists/${listId}/share`, headers: { cookie: robin.session } })).json();
  assert.equal(before.share_token, null);

  // A third, non-admin member is neither the owner nor an admin.
  const sam = await join('Sam');
  const res = await app.inject({ method: 'POST', url: `/api/gift-lists/${listId}/share`, headers: { cookie: sam.session } });
  assert.equal(res.statusCode, 404);
});

test('share link: owner mints, rotates, and turns it off', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);

  const minted = (await app.inject({ method: 'POST', url: `/api/gift-lists/${listId}/share`, headers: { cookie: robin.session } })).json();
  assert.ok(minted.share_token);

  const rotated = (await app.inject({ method: 'POST', url: `/api/gift-lists/${listId}/share`, headers: { cookie: robin.session } })).json();
  assert.ok(rotated.share_token);
  assert.notEqual(rotated.share_token, minted.share_token);

  const off = (await app.inject({ method: 'DELETE', url: `/api/gift-lists/${listId}/share`, headers: { cookie: robin.session } })).json();
  assert.equal(off.share_token, null);
});

test('share link: an admin may manage any member\'s share even without owning it', opts, async () => {
  const robin = await join('Robin');
  const listId = await ownListId(robin.session);
  // Alex is admin (first registrant) but not Robin's list owner.
  const res = await app.inject({ method: 'POST', url: `/api/gift-lists/${listId}/share`, headers: { cookie } });
  assert.equal(res.statusCode, 200);
});

test('any household member may manage an external list\'s share', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/gift-lists', headers: { cookie },
    payload: { external_name: 'Lisa (friend)' },
  })).json();
  const robin = await join('Robin');
  const res = await app.inject({ method: 'POST', url: `/api/gift-lists/${created.id}/share`, headers: { cookie: robin.session } });
  assert.equal(res.statusCode, 200);
});

test('a pet gets a list too, and it behaves like any other non-owner list — never masked', opts, async () => {
  await app.inject({ method: 'POST', url: '/api/users', headers: { cookie }, payload: { name: 'Whiskers', kind: 'pet' } });
  // Any GET as a household member backfills a list for every pet still missing one.
  const forAlex = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const petList = forAlex.others.find((l: { owner_kind: string }) => l.owner_kind === 'pet');
  assert.ok(petList, 'pet should have a gift list');
  assert.equal(petList.owner_name, 'Whiskers');

  const added = (await app.inject({
    method: 'POST', url: `/api/gift-lists/${petList.id}/items`, headers: { cookie },
    payload: { title: 'Catnip fortress' },
  })).json();
  assert.equal(added.status, 'idea');
  // A pet can never be "the owner" at request time, so status is never
  // masked for anyone viewing its list — marking it bought sticks.
  await app.inject({ method: 'PATCH', url: `/api/gift-lists/items/${added.id}`, headers: { cookie }, payload: { status: 'bought' } });
  const refetched = (await app.inject({ method: 'GET', url: '/api/gift-lists', headers: { cookie } })).json();
  const item = refetched.others.find((l: { id: number }) => l.id === petList.id).items[0];
  assert.equal(item.status, 'bought');
});
