import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password.js';

test('hashPassword produces a salt:key hex string', async () => {
  const stored = await hashPassword('correct horse battery staple');
  const [salt, key] = stored.split(':');
  assert.ok(salt && key, 'has both segments');
  assert.match(salt, /^[0-9a-f]{32}$/, 'salt is 16 bytes hex');
  assert.match(key, /^[0-9a-f]{128}$/, 'key is 64 bytes hex');
});

test('verifyPassword accepts the correct password', async () => {
  const stored = await hashPassword('s3cret-pass');
  assert.equal(await verifyPassword('s3cret-pass', stored), true);
});

test('verifyPassword rejects the wrong password', async () => {
  const stored = await hashPassword('s3cret-pass');
  assert.equal(await verifyPassword('wrong-pass', stored), false);
});

test('each hash uses a fresh salt (no two hashes match)', async () => {
  const a = await hashPassword('same-input');
  const b = await hashPassword('same-input');
  assert.notEqual(a, b, 'salts differ so stored values differ');
  // ...yet both verify against the original password.
  assert.equal(await verifyPassword('same-input', a), true);
  assert.equal(await verifyPassword('same-input', b), true);
});

test('verifyPassword returns false for malformed stored values', async () => {
  assert.equal(await verifyPassword('x', ''), false);
  assert.equal(await verifyPassword('x', 'no-colon'), false);
  assert.equal(await verifyPassword('x', 'onlysalt:'), false);
  assert.equal(await verifyPassword('x', ':onlykey'), false);
});

test('verifyPassword rejects a tampered key without throwing', async () => {
  const stored = await hashPassword('pw');
  const [salt] = stored.split(':');
  // A key of the wrong byte-length must be handled gracefully (no throw).
  assert.equal(await verifyPassword('pw', `${salt}:abcd`), false);
});
