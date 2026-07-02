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
