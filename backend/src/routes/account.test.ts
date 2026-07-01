import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let app: FastifyInstance;

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  await h.setupTestDb();
  app = await h.makeApp();
});
beforeEach(async () => { if (dbAvailable) await h.truncateAll(); });
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

test('a user can change their password and log in with the new one', opts, async () => {
  const cookie = await h.registerAndLogin(app, 'Sam', 'password123');

  // Wrong current password is rejected.
  const bad = await app.inject({
    method: 'POST', url: '/api/auth/password', headers: { cookie },
    payload: { current_password: 'wrong', new_password: 'newpassword456' },
  });
  assert.equal(bad.statusCode, 403);

  // Correct current password succeeds.
  const ok = await app.inject({
    method: 'POST', url: '/api/auth/password', headers: { cookie },
    payload: { current_password: 'password123', new_password: 'newpassword456' },
  });
  assert.equal(ok.statusCode, 200);

  // Old password no longer works; new one does.
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'password123' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'newpassword456' } })).statusCode, 200);
});

test('password change requires a session', opts, async () => {
  await h.registerAndLogin(app, 'Sam', 'password123');
  const res = await app.inject({
    method: 'POST', url: '/api/auth/password',
    payload: { current_password: 'password123', new_password: 'newpassword456' },
  });
  assert.equal(res.statusCode, 401);
});

test('a member can edit their own profile (name/email) but not another member', opts, async () => {
  const adminCookie = await h.registerAndLogin(app, 'Sam', 'password123');
  const invite = (await app.inject({ method: 'POST', url: '/api/invites', headers: { cookie: adminCookie }, payload: {} })).json();
  const join = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Alex', password: 'password123', invite_code: invite.code },
  });
  const memberCookie = h.sessionCookie(join);
  const memberId = join.json().id;
  const adminId = 1;

  // Member edits self — allowed, email round-trips.
  const selfEdit = await app.inject({
    method: 'PATCH', url: `/api/users/${memberId}`, headers: { cookie: memberCookie },
    payload: { email: 'alex@example.com' },
  });
  assert.equal(selfEdit.statusCode, 200);
  assert.equal(selfEdit.json().email, 'alex@example.com');

  // Member tries to edit the admin — forbidden.
  const cross = await app.inject({
    method: 'PATCH', url: `/api/users/${adminId}`, headers: { cookie: memberCookie },
    payload: { name: 'Hacked' },
  });
  assert.equal(cross.statusCode, 403);

  // Admin can edit anyone.
  const adminEdit = await app.inject({
    method: 'PATCH', url: `/api/users/${memberId}`, headers: { cookie: adminCookie },
    payload: { name: 'Alexandra' },
  });
  assert.equal(adminEdit.statusCode, 200);
  assert.equal(adminEdit.json().name, 'Alexandra');
});

test('repeated failed logins are rate-limited', opts, async () => {
  await h.registerAndLogin(app, 'Sam', 'password123');
  let sawLimit = false;
  for (let i = 0; i < 10; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { name: 'Sam', password: 'nope' } });
    if (res.statusCode === 429) { sawLimit = true; break; }
  }
  assert.ok(sawLimit, 'expected a 429 after several failed attempts');
});
