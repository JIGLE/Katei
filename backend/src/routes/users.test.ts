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

test('removing a member who owned a private stream deletes that stream\'s pending events', opts, async () => {
  const { query } = await import('../db.js');
  const robin = await join('Robin');
  const stream = (await app.inject({
    method: 'POST', url: '/api/money-streams', headers: { cookie: robin.session },
    payload: { name: 'Therapy', amount: 80, private: true },
  })).json();
  const event = (await app.inject({
    method: 'POST', url: '/api/events', headers: { cookie: robin.session },
    payload: { title: 'Therapy due', event_type: 'payment', target_date: '2999-01-01', money_stream_id: stream.id },
  })).json();

  const del = await app.inject({ method: 'DELETE', url: `/api/users/${robin.id}`, headers: { cookie } });
  assert.equal(del.statusCode, 204);

  // Gone entirely, not merely unlinked — otherwise the next scheduler sweep
  // would broadcast its (denormalized) title to the whole household, since
  // the owner-only assignment that was suppressing that fallback is gone too.
  const { rows } = await query('SELECT id FROM household_events WHERE id = $1', [event.id]);
  assert.equal(rows.length, 0);
});
