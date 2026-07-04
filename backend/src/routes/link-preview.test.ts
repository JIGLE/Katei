import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { parseLinkMeta, isPrivateAddress } from '../lib/linkmeta.js';

// --- Pure parser + SSRF classifier: no DB or network needed -------------

test('parseLinkMeta prefers og tags and decodes entities', () => {
  const html = `<html><head>
    <title>Fallback &amp; Title</title>
    <meta property="og:title" content="Nice &quot;Lamp&quot; &#39;70s" />
    <meta content="Shop Co" property="og:site_name">
  </head></html>`;
  const meta = parseLinkMeta(html);
  assert.equal(meta.title, `Nice "Lamp" '70s`);
  assert.equal(meta.site, 'Shop Co');
});

test('parseLinkMeta falls back to <title> and handles absence', () => {
  assert.equal(parseLinkMeta('<title>  Plain\n Page </title>').title, 'Plain Page');
  assert.deepEqual(parseLinkMeta('<p>no head</p>'), { title: null, site: null });
});

test('isPrivateAddress classifies the ranges the server must never fetch', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::2', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ['93.184.216.34', '172.32.0.1', '8.8.8.8', '2606:2800:220:1:248:1893:25c8:1946']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

// --- Route guards (DB-backed app) ----------------------------------------

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

test('rejects non-http schemes and private/loopback hosts with 400', opts, async () => {
  for (const url of [
    'file:///etc/passwd',
    'ftp://example.com/x',
    'http://localhost/admin',
    'http://127.0.0.1:3000/health',
    'http://10.0.0.5/',
    'http://192.168.1.1/',
    'http://169.254.169.254/latest/meta-data/',
    'not a url',
  ]) {
    const res = await app.inject({ method: 'POST', url: '/api/link-preview', headers: { cookie }, payload: { url } });
    assert.equal(res.statusCode, 400, url);
  }
});

test('requires authentication', opts, async () => {
  const res = await app.inject({ method: 'POST', url: '/api/link-preview', payload: { url: 'https://example.com' } });
  assert.equal(res.statusCode, 401);
});
