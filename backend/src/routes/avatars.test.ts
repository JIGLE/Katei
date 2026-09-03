import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { FastifyInstance } from 'fastify';

// Must be set before the app (and lib/avatars.ts) is first imported — uploads
// in tests must never write into the real data volume.
process.env.AVATAR_DIR = mkdtempSync(path.join(tmpdir(), 'katei-avatars-'));

const dbAvailable = !!process.env.DATABASE_URL;
let h: typeof import('../test-helpers.js');
let avatarLib: typeof import('../lib/avatars.js');
let app: FastifyInstance;
let cookie: string;
// A genuinely decodable JPEG, synthesized once — real image bytes, not just
// magic numbers, so it survives the sharp processing pipeline.
let REAL_JPEG: Buffer;

before(async () => {
  REAL_JPEG = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#3a6' } }).jpeg().toBuffer();
  if (!dbAvailable) return;
  h = await import('../test-helpers.js');
  // Dynamic, like test-helpers.js above: lib/avatars.js reads AVATAR_DIR at
  // module-load time, so a static top-level import would resolve it before
  // the env var above is set.
  avatarLib = await import('../lib/avatars.js');
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
// Real JPEG magic bytes, but not an actually decodable image — passes the
// cheap byte-sniff, fails real decoding. Used to test the "corrupt image"
// rejection path now that uploads are actually processed, not just sniffed.
const CORRUPT_JPEG_STUB = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('fakejpegbody')]);

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
  const res = await upload(REAL_JPEG, 'photo.png', 'image/png');
  assert.equal(res.statusCode, 200);
  assert.match(res.json().avatar_url, /\.jpg$/);
});

// --- Downscaling: any reasonable original is accepted; huge/corrupt still isn't ---

test('a large, non-square photo is downscaled to fit within the stored size limit', opts, async () => {
  const original = await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: '#5577aa' },
  }).jpeg().toBuffer();
  const res = await upload(original, 'big.jpg', 'image/jpeg');
  assert.equal(res.statusCode, 200);

  const served = await app.inject({ method: 'GET', url: res.json().avatar_url, headers: { cookie } });
  assert.equal(served.statusCode, 200);
  const meta = await sharp(served.rawPayload).metadata();
  assert.ok(meta.width! <= 512 && meta.height! <= 512, `expected <=512px, got ${meta.width}x${meta.height}`);
  // Aspect ratio preserved — no server-side cropping.
  const originalRatio = 2400 / 1600;
  const storedRatio = meta.width! / meta.height!;
  assert.ok(Math.abs(originalRatio - storedRatio) < 0.01, `aspect ratio drifted: ${storedRatio} vs ${originalRatio}`);
});

test('a file larger than the new ceiling is rejected', opts, async () => {
  const tooBig = Buffer.alloc(21 * 1024 * 1024, 0xff);
  const res = await upload(tooBig, 'huge.jpg', 'image/jpeg');
  assert.equal(res.statusCode, 413);
});

test('a corrupt image that passes the byte-sniff is rejected', opts, async () => {
  const res = await upload(CORRUPT_JPEG_STUB, 'photo.jpg', 'image/jpeg');
  assert.equal(res.statusCode, 400);
  assert.doesNotMatch(res.json().error, /JPG or PNG/i); // distinct from the sniff-rejection message
});

test('uploading a new avatar deletes the previous file', opts, async () => {
  const first = await upload(PNG_1PX, 'first.png', 'image/png');
  assert.equal(first.statusCode, 200);
  const firstPath = avatarLib.avatarPath(first.json().avatar_url.split('/').pop());
  assert.ok(firstPath && existsSync(firstPath));

  const second = await upload(REAL_JPEG, 'second.jpg', 'image/jpeg');
  assert.equal(second.statusCode, 200);
  assert.notEqual(second.json().avatar_url, first.json().avatar_url);
  assert.ok(!existsSync(firstPath!));
});
