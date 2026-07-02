import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

// Must be set before the app (and lib/avatars.ts) is first imported — uploads
// in tests must never write into the real data volume.
process.env.AVATAR_DIR = mkdtempSync(path.join(tmpdir(), 'katei-avatars-'));

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

test('the avatar serve route rejects unsafe names and 404s unknown files', opts, async () => {
  const bad = await app.inject({ method: 'GET', url: '/api/avatars/..%2f..%2fetc%2fpasswd', headers: { cookie } });
  assert.equal(bad.statusCode, 400);
  const missing = await app.inject({ method: 'GET', url: '/api/avatars/9_1_deadbeef.png', headers: { cookie } });
  assert.equal(missing.statusCode, 404);
});

// --- Upload content validation: trust bytes, not the client mimetype (S5) ---

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG_STUB = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fakejpegbody')]);

function multipart(data: Buffer, filename: string, mimetype: string) {
  const boundary = '----kateitestboundary';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`,
      ),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

const upload = (data: Buffer, filename: string, mimetype: string) => {
  const { headers, payload } = multipart(data, filename, mimetype);
  return app.inject({
    method: 'POST', url: '/api/users/1/avatar',
    headers: { cookie, ...headers }, payload,
  });
};

test('non-image bytes labeled image/png are rejected', opts, async () => {
  const res = await upload(Buffer.from('<script>alert(1)</script>'), 'evil.png', 'image/png');
  assert.equal(res.statusCode, 400);
  assert.match(res.json().error, /JPG or PNG/i);
});

test('a real PNG uploads, even when the client mimetype lies', opts, async () => {
  // Claimed JPEG, actual PNG: the stored extension must follow the bytes.
  const res = await upload(PNG_1PX, 'photo.jpg', 'image/jpeg');
  assert.equal(res.statusCode, 200);
  assert.match(res.json().avatar_url, /\.png$/);
  // And the file it points to is served back.
  const served = await app.inject({ method: 'GET', url: res.json().avatar_url, headers: { cookie } });
  assert.equal(served.statusCode, 200);
  assert.equal(served.headers['content-type'], 'image/png');
});

test('JPEG magic bytes store as .jpg', opts, async () => {
  const res = await upload(JPEG_STUB, 'photo.png', 'image/png');
  assert.equal(res.statusCode, 200);
  assert.match(res.json().avatar_url, /\.jpg$/);
});
