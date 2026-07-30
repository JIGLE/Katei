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

const make = (over: Record<string, unknown> = {}) => ({
  title: 'Dentist', event_type: 'appointment', target_date: '2999-01-01', ...over,
});

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

test('creates and lists events', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make() });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().title, 'Dentist');

  const list = await app.inject({ method: 'GET', url: '/api/events', headers: { cookie } });
  assert.equal(list.json().length, 1);
});

test('rejects an invalid event_type', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ event_type: 'bogus' }) });
  assert.equal(res.statusCode, 400);
});

test('a plain event with money_stream_id: null is created (no null→0 coercion)', opts, async () => {
  // Exactly what the form sends for "Linked cost: None". Without a nullable
  // schema, ajv coerces null→0, which fails the money_stream_id foreign key.
  const res = await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: make({ title: 'Bastian Vet', money_stream_id: null, description: null }),
  });
  assert.equal(res.statusCode, 201);
  assert.equal(res.json().money_stream_id, null); // stored as null, not 0
});

test('upcoming keeps open overdue items first and excludes completed ones', opts, async () => {
  await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ title: 'Future', target_date: '2999-01-01' }) });
  await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ title: 'Overdue', target_date: '2000-01-01' }) });
  const done = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ title: 'Done', target_date: '2000-02-01' }) })).json();
  await app.inject({ method: 'PATCH', url: `/api/events/${done.id}/complete`, headers: { cookie }, payload: { is_completed: true } });

  const upcoming = (await app.inject({ method: 'GET', url: '/api/events?upcoming=true', headers: { cookie } })).json();
  assert.deepEqual(upcoming.map((e: { title: string }) => e.title), ['Overdue', 'Future']);
});

test('toggles completion', opts, async () => {
  const created = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make() })).json();
  const res = await app.inject({
    method: 'PATCH', url: `/api/events/${created.id}/complete`, headers: { cookie },
    payload: { is_completed: true },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().is_completed, true);
});

test('mark as paid records the actual amount', opts, async () => {
  const created = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make({ title: 'Water due', event_type: 'payment' }) })).json();
  const res = await app.inject({
    method: 'PATCH', url: `/api/events/${created.id}`, headers: { cookie },
    payload: { is_completed: true, actual_amount: 142.84 },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.is_completed, true);
  assert.equal(Number(body.actual_amount), 142.84);
});

test('deletes an event and 404s afterwards', opts, async () => {
  const created = (await app.inject({ method: 'POST', url: '/api/events', headers: { cookie }, payload: make() })).json();
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/events/${created.id}`, headers: { cookie } })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: `/api/events/${created.id}`, headers: { cookie } })).statusCode, 404);
});

test('an event linked to another member\'s private stream is invisible to a non-owner', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: make({ title: 'Therapy due', event_type: 'payment', money_stream_id: stream.id }),
  })).json();

  const robin = await join('Robin');
  const list = (await app.inject({ method: 'GET', url: '/api/events', headers: { cookie: robin.session } })).json();
  assert.equal(list.length, 0);
  assert.equal(
    (await app.inject({ method: 'GET', url: `/api/events/${event.id}`, headers: { cookie: robin.session } })).statusCode,
    404,
  );

  // The owner still sees it.
  const mine = (await app.inject({ method: 'GET', url: '/api/events', headers: { cookie } })).json();
  assert.equal(mine.length, 1);
});

test('POST referencing a private stream you don\'t own is rejected', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  const robin = await join('Robin');
  const res = await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie: robin.session },
    payload: make({ money_stream_id: stream.id }),
  });
  assert.equal(res.statusCode, 400);
});

test('a non-owner 404s completing or deleting an event linked to a private stream', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: make({ event_type: 'payment', money_stream_id: stream.id }),
  })).json();
  const robin = await join('Robin');

  const complete = await app.inject({
    method: 'PATCH', url: `/api/events/${event.id}/complete`, headers: { cookie: robin.session },
    payload: { is_completed: true },
  });
  assert.equal(complete.statusCode, 404);

  const del = await app.inject({ method: 'DELETE', url: `/api/events/${event.id}`, headers: { cookie: robin.session } });
  assert.equal(del.statusCode, 404);
});

test('confirming a savings event linked to a private stream stores a null note', opts, async () => {
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie },
    payload: { name: 'Surprise gift fund', amount: 50, stream_type: 'savings', private: true },
  })).json();
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: make({ title: 'Surprise gift fund', event_type: 'savings', money_stream_id: stream.id }),
  })).json();
  await app.inject({ method: 'PATCH', url: `/api/events/${event.id}/complete`, headers: { cookie }, payload: { is_completed: true } });

  const savings = (await app.inject({ method: 'GET', url: '/api/savings', headers: { cookie } })).json();
  assert.equal(savings.entries.length, 1);
  assert.equal(savings.entries[0].note, null);
});
