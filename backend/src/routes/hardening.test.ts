import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let db: typeof import('../db.js');
let app: FastifyInstance;
let cookie: string;

before(async () => {
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  db = await import('../db.js');
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

const addEvent = (title: string) =>
  app.inject({
    method: 'POST', url: '/api/events', headers: { cookie },
    payload: { title, event_type: 'deadline', target_date: '2999-01-01' },
  });

test('a drifted id sequence yields a clean 409, not an opaque 500', opts, async () => {
  assert.equal((await addEvent('First')).statusCode, 201);
  // Simulate a restored DB: rewind the sequence so the next id collides.
  await db.pool.query(`SELECT setval(pg_get_serial_sequence('household_events','id'), 1, false)`);
  const res = await addEvent('Second');
  assert.equal(res.statusCode, 409); // mapped by the global error handler
  assert.match(res.json().error, /already exists/i);
});

test('resyncSequences() self-heals a drifted sequence so inserts resume', opts, async () => {
  assert.equal((await addEvent('First')).statusCode, 201);
  await db.pool.query(`SELECT setval(pg_get_serial_sequence('household_events','id'), 1, false)`);
  await db.resyncSequences();
  assert.equal((await addEvent('Second')).statusCode, 201);
  assert.equal((await addEvent('Third')).statusCode, 201);
});

// --- Rate limiting on abuse-prone routes (S4) ---

test('invite-code checks are throttled per IP', opts, async () => {
  let last = 0;
  for (let i = 0; i < 20; i++) {
    last = (await app.inject({ method: 'GET', url: '/api/auth/invite/nope' })).statusCode;
  }
  assert.equal(last, 200); // still inside the window
  const blocked = await app.inject({ method: 'GET', url: '/api/auth/invite/nope' });
  assert.equal(blocked.statusCode, 429);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
});

test('registration attempts are throttled per IP', opts, async () => {
  // The admin registration in beforeEach already used one attempt.
  let saw429 = false;
  for (let i = 0; i < 12; i++) {
    const res = await app.inject({
      method: 'POST', url: '/api/auth/register',
      payload: { name: `Guess${i}`, password: 'password123', invite_code: 'wrong' },
    });
    if (res.statusCode === 429) { saw429 = true; break; }
    assert.equal(res.statusCode, 403); // invalid invite until the limiter kicks in
  }
  assert.ok(saw429, 'expected a 429 within 12 invalid-invite registrations');
});

test('wrong calendar tokens are throttled, the valid feed never is', opts, async () => {
  const tok = (await app.inject({ method: 'GET', url: '/api/settings/calendar', headers: { cookie } })).json().token;
  // Burn the failure budget with bad guesses…
  let last = 0;
  for (let i = 0; i < 31; i++) {
    last = (await app.inject({ method: 'GET', url: `/api/calendar/guess${i}.ics` })).statusCode;
  }
  assert.equal(last, 429);
  // …and the real subscriber still gets the feed.
  const ok = await app.inject({ method: 'GET', url: `/api/calendar/${tok}.ics` });
  assert.equal(ok.statusCode, 200);
});

test('current-password guesses on /auth/password are throttled', opts, async () => {
  let last;
  for (let i = 0; i < 9; i++) {
    last = await app.inject({
      method: 'POST', url: '/api/auth/password', headers: { cookie },
      payload: { current_password: 'wrong-guess', new_password: 'newpassword123' },
    });
  }
  assert.equal(last!.statusCode, 429);
});

// --- Security headers (S3) ---

test('responses carry the helmet security headers', opts, async () => {
  const res = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.match(String(res.headers['content-security-policy']), /default-src 'self'/);
  assert.match(String(res.headers['content-security-policy']), /frame-ancestors 'none'/);
  assert.match(String(res.headers['content-security-policy']), /script-src 'self'/);
  assert.ok(res.headers['strict-transport-security']);
});

// --- CORS: a cookie-authed API must never reflect arbitrary origins (S2) ---

test('a foreign Origin is not reflected by default (same-origin only)', opts, async () => {
  const res = await app.inject({
    method: 'GET', url: '/health',
    headers: { origin: 'https://evil.example' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['access-control-allow-origin'], undefined);
  assert.equal(res.headers['access-control-allow-credentials'], undefined);
});

test('a preflight from a foreign origin gets no CORS approval by default', opts, async () => {
  const res = await app.inject({
    method: 'OPTIONS', url: '/api/events',
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
  });
  assert.equal(res.headers['access-control-allow-origin'], undefined);
});

test('an allowlisted origin (CORS_ORIGINS) is honoured with credentials', opts, async () => {
  const allowed = await (await import('../app.js')).buildApp({
    jwtSecret: 'integration-test-secret',
    logger: false,
    serveStatic: false,
    corsOrigins: ['https://home.example'],
  });
  try {
    const ok = await allowed.inject({
      method: 'GET', url: '/health', headers: { origin: 'https://home.example' },
    });
    assert.equal(ok.headers['access-control-allow-origin'], 'https://home.example');
    assert.equal(ok.headers['access-control-allow-credentials'], 'true');
    // A non-listed origin still gets nothing, even with an allowlist configured.
    const other = await allowed.inject({
      method: 'GET', url: '/health', headers: { origin: 'https://evil.example' },
    });
    assert.equal(other.headers['access-control-allow-origin'], undefined);
  } finally {
    await allowed.close();
  }
});
