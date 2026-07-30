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

test('omitted currency defaults to the household currency, not USD', opts, async () => {
  await app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'DK', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen' },
  });
  const res = await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'El', amount: 300 },
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().currency, 'DKK');
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

test('POST with private:true sets the caller as owner', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  assert.equal(created.private, true);
  assert.equal(created.owner_user_id, 1); // Sam is user id 1, the first registrant
});

test('a private stream is invisible to a non-owner, in the list and by id', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();

  const robin = await join('Robin');
  const list = (await app.inject({ method: 'GET', url: '/api/money-streams', headers: { cookie: robin.session } })).json();
  assert.equal(list.length, 0);
  assert.equal(
    (await app.inject({ method: 'GET', url: `/api/money-streams/${created.id}`, headers: { cookie: robin.session } })).statusCode,
    404,
  );

  // The owner still sees it.
  const mine = (await app.inject({ method: 'GET', url: '/api/money-streams', headers: { cookie } })).json();
  assert.equal(mine.length, 1);
});

test('a non-owner 404s patching or deleting a private stream', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  const robin = await join('Robin');

  const patch = await app.inject({
    method: 'PATCH', url: `/api/money-streams/${created.id}`, headers: { cookie: robin.session },
    payload: { amount: 90 },
  });
  assert.equal(patch.statusCode, 404);

  const del = await app.inject({ method: 'DELETE', url: `/api/money-streams/${created.id}`, headers: { cookie: robin.session } });
  assert.equal(del.statusCode, 404);
});

test('claiming an unowned stream as private sets the caller as owner; only that owner can un-private it', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Council tax', amount: 150 },
  })).json();
  assert.equal(created.private, false);

  const robin = await join('Robin');
  const claimed = (await app.inject({
    method: 'PATCH', url: `/api/money-streams/${created.id}`, headers: { cookie: robin.session },
    payload: { private: true },
  })).json();
  assert.equal(claimed.private, true);
  assert.equal(claimed.owner_user_id, robin.id);

  // Sam (the original creator, not the new owner) can no longer touch it.
  const samPatch = await app.inject({
    method: 'PATCH', url: `/api/money-streams/${created.id}`, headers: { cookie },
    payload: { private: false },
  });
  assert.equal(samPatch.statusCode, 404);

  // Robin (the owner) can un-private it.
  const unPrivated = (await app.inject({
    method: 'PATCH', url: `/api/money-streams/${created.id}`, headers: { cookie: robin.session },
    payload: { private: false },
  })).json();
  assert.equal(unPrivated.private, false);
  assert.equal(unPrivated.owner_user_id, null);
});

test('deleting a private stream also removes its linked events', opts, async () => {
  const created = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title: 'Therapy due', event_type: 'payment', target_date: '2999-01-01', money_stream_id: created.id },
  })).json();

  await app.inject({ method: 'DELETE', url: `/api/money-streams/${created.id}`, headers: { cookie } });

  const check = await app.inject({ method: 'GET', url: `/api/events/${event.id}`, headers: { cookie } });
  assert.equal(check.statusCode, 404, 'the event should be gone, not merely unlinked');
});
