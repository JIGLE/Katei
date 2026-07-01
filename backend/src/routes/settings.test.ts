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

test('preferences return EU-leaning defaults', opts, async () => {
  const res = await app.inject({ method: 'GET', url: '/api/settings/preferences', headers: { cookie } });
  assert.equal(res.statusCode, 200);
  const p = res.json();
  assert.equal(p.country, 'DE');
  assert.equal(p.currency, 'EUR');
  assert.equal(p.locale, 'de-DE');
  assert.equal(p.timezone, 'Europe/Berlin');
  assert.equal(p.theme, 'dark');
  assert.equal(p.savings_goal, 0);
});

test('PUT persists preferences including theme and savings goal', opts, async () => {
  const put = await app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'DK', currency: 'DKK', locale: 'da-DK', timezone: 'Europe/Copenhagen', language: 'en', savings_goal: 500, theme: 'light', household_name: 'The Nguyens' },
  });
  assert.equal(put.statusCode, 200);

  const got = (await app.inject({ method: 'GET', url: '/api/settings/preferences', headers: { cookie } })).json();
  assert.equal(got.locale, 'da-DK');
  assert.equal(got.timezone, 'Europe/Copenhagen');
  assert.equal(got.language, 'en');
  assert.equal(got.savings_goal, 500);
  assert.equal(got.theme, 'light');
  assert.equal(got.household_name, 'The Nguyens');
});

test('household_name defaults to empty string', opts, async () => {
  const p = (await app.inject({ method: 'GET', url: '/api/settings/preferences', headers: { cookie } })).json();
  assert.equal(p.household_name, '');
});

test('language defaults to the locale language when omitted', opts, async () => {
  await app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'FR', currency: 'EUR', locale: 'fr-FR', timezone: 'Europe/Paris' },
  });
  const got = (await app.inject({ method: 'GET', url: '/api/settings/preferences', headers: { cookie } })).json();
  assert.equal(got.language, 'fr');
});

test('rejects an invalid currency code', opts, async () => {
  const res = await app.inject({
    method: 'PUT', url: '/api/settings/preferences', headers: { cookie },
    payload: { country: 'DE', currency: 'EUROS', locale: 'de-DE', timezone: 'Europe/Berlin' },
  });
  assert.equal(res.statusCode, 400);
});
