import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let app: FastifyInstance;
let adminCookie: string;

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  await h.setupTestDb();
  app = await h.makeApp();
});
beforeEach(async () => {
  if (!dbAvailable) return;
  await h.truncateAll();
  adminCookie = await h.registerAndLogin(app, 'Sam', 'password123'); // first account = admin
});
after(async () => { if (dbAvailable) { await app?.close(); await h.closePool(); } });

const opts = { skip: dbAvailable ? false : 'no DATABASE_URL' };

const mintInvite = async (cookie: string, body: Record<string, unknown> = {}) =>
  app.inject({ method: 'POST', url: '/api/invites', headers: { cookie }, payload: body });

test('the first account is an admin', opts, async () => {
  const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: adminCookie } })).json();
  assert.equal(me.role, 'admin');
});

test('registration without an invite is refused after setup', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: { name: 'Alex', password: 'password123' } });
  assert.equal(res.statusCode, 403);
});

test('an invite lets a new member join as a member, and is single-use', opts, async () => {
  const invite = (await mintInvite(adminCookie)).json();
  assert.equal(invite.role, 'member');

  // Public validation before redemption.
  let check = (await app.inject({ method: 'GET', url: `/api/auth/invite/${invite.code}` })).json();
  assert.deepEqual(check, { valid: true, role: 'member' });

  const joined = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Alex', password: 'password123', invite_code: invite.code },
  });
  assert.equal(joined.statusCode, 201);
  assert.equal(joined.json().role, 'member');
  assert.ok(joined.cookies.find((c) => c.name === 'katei_session'));

  // The code is now spent.
  check = (await app.inject({ method: 'GET', url: `/api/auth/invite/${invite.code}` })).json();
  assert.equal(check.valid, false);
  const reuse = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Robin', password: 'password123', invite_code: invite.code },
  });
  assert.equal(reuse.statusCode, 403);
});

test('an admin invite grants the admin role', opts, async () => {
  const invite = (await mintInvite(adminCookie, { role: 'admin' })).json();
  const joined = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Alex', password: 'password123', invite_code: invite.code },
  });
  assert.equal(joined.json().role, 'admin');
});

test('non-admins cannot mint invites or add members', opts, async () => {
  const invite = (await mintInvite(adminCookie)).json();
  const join = await app.inject({
    method: 'POST', url: '/api/auth/register',
    payload: { name: 'Alex', password: 'password123', invite_code: invite.code },
  });
  const memberCookie = h.sessionCookie(join);

  assert.equal((await mintInvite(memberCookie)).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/invites', headers: { cookie: memberCookie } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/users', headers: { cookie: memberCookie }, payload: { name: 'Kid' } })).statusCode, 403);

  // Admin can do all of those.
  assert.equal((await app.inject({ method: 'POST', url: '/api/users', headers: { cookie: adminCookie }, payload: { name: 'Kid' } })).statusCode, 201);
});

test('revoking an invite invalidates it', opts, async () => {
  const invite = (await mintInvite(adminCookie)).json();
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/invites/${invite.id}`, headers: { cookie: adminCookie } })).statusCode, 204);
  const check = (await app.inject({ method: 'GET', url: `/api/auth/invite/${invite.code}` })).json();
  assert.equal(check.valid, false);
});
