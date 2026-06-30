import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { sendNtfy, generateRecurringEvents, resolveRecipients } = await import('./notifications.js');
import type { query as Query } from '../db.js';

// --- resolveRecipients: who gets an event's reminder -----------------------

test('resolveRecipients prefers assignee URLs, de-duplicated', () => {
  assert.deepEqual(
    resolveRecipients('https://ntfy.sh/house', [
      'https://ntfy.sh/sam',
      'https://ntfy.sh/sam',
      'https://ntfy.sh/alex',
    ]),
    ['https://ntfy.sh/sam', 'https://ntfy.sh/alex'],
  );
});

test('resolveRecipients falls back to the household URL when no assignees', () => {
  assert.deepEqual(resolveRecipients('https://ntfy.sh/house', []), ['https://ntfy.sh/house']);
  assert.deepEqual(resolveRecipients('https://ntfy.sh/house', ['', '  ']), [
    'https://ntfy.sh/house',
  ]);
});

test('resolveRecipients returns nothing when there is no URL at all', () => {
  assert.deepEqual(resolveRecipients('', []), []);
  assert.deepEqual(resolveRecipients('   ', ['']), []);
});

// --- sendNtfy: HTTP delivery, no DB involved -------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test('sendNtfy throws when no URL is configured', async () => {
  await assert.rejects(() => sendNtfy('', 'hi'), /No ntfy URL/);
});

test('sendNtfy POSTs the body and maps options to headers', async () => {
  let captured: { url: string; init: RequestInit } | null = null;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    captured = { url, init };
    return new Response('ok', { status: 200 });
  }) as typeof fetch;

  await sendNtfy('https://ntfy.sh/topic', 'Rent due', {
    title: 'Katei',
    tags: 'calendar',
    priority: 'high',
  });

  assert.ok(captured);
  assert.equal(captured!.url, 'https://ntfy.sh/topic');
  assert.equal(captured!.init.method, 'POST');
  assert.equal(captured!.init.body, 'Rent due');
  const headers = captured!.init.headers as Record<string, string>;
  assert.equal(headers.Title, 'Katei');
  assert.equal(headers.Tags, 'calendar');
  assert.equal(headers.Priority, 'high');
});

test('sendNtfy throws on a non-2xx response', async () => {
  globalThis.fetch = (async () => new Response('nope', { status: 502 })) as typeof fetch;
  await assert.rejects(() => sendNtfy('https://ntfy.sh/topic', 'x'), /502/);
});

// --- generateRecurringEvents: DB logic via an injected fake query ----------

interface Call {
  text: string;
  params?: unknown[];
}

/**
 * Build a fake `query` that returns the given streams, reports whether each
 * stream already has an upcoming event, and records INSERTs.
 */
function fakeQuery(
  streams: { id: number; name: string; frequency: string }[],
  hasUpcoming: (streamId: number) => boolean,
) {
  const inserts: Call[] = [];
  const q = (async (text: string, params?: unknown[]) => {
    if (/FROM money_streams/.test(text)) return { rows: streams };
    if (/count\(\*\)/.test(text)) {
      const id = params?.[0] as number;
      return { rows: [{ count: hasUpcoming(id) ? '1' : '0' }] };
    }
    if (/INSERT INTO household_events/.test(text)) {
      inserts.push({ text, params });
      return { rows: [] };
    }
    throw new Error(`unexpected query: ${text}`);
  }) as unknown as typeof Query;
  return { q, inserts };
}

test('generates an event for a recurring stream with no upcoming event', async () => {
  const { q, inserts } = fakeQuery([{ id: 1, name: 'Rent', frequency: 'monthly' }], () => false);
  const created = await generateRecurringEvents(undefined, q);
  assert.equal(created, 1);
  assert.equal(inserts.length, 1);
  assert.deepEqual(inserts[0].params, ['Rent due', 1]);
  assert.match(inserts[0].text, /date_trunc\('month'/);
});

test('skips a stream that already has an upcoming event', async () => {
  const { q, inserts } = fakeQuery([{ id: 2, name: 'Netflix', frequency: 'monthly' }], () => true);
  const created = await generateRecurringEvents(undefined, q);
  assert.equal(created, 0);
  assert.equal(inserts.length, 0);
});

test('yearly streams use the year boundary date expression', async () => {
  const { q, inserts } = fakeQuery([{ id: 3, name: 'Insurance', frequency: 'yearly' }], () => false);
  await generateRecurringEvents(undefined, q);
  assert.match(inserts[0].text, /date_trunc\('year'/);
});

test('handles a mix: creates for missing, skips existing', async () => {
  const streams = [
    { id: 1, name: 'Rent', frequency: 'monthly' },
    { id: 2, name: 'Netflix', frequency: 'monthly' },
    { id: 3, name: 'Insurance', frequency: 'yearly' },
  ];
  // Only Netflix (id 2) already has an upcoming event.
  const { q, inserts } = fakeQuery(streams, (id) => id === 2);
  const created = await generateRecurringEvents(undefined, q);
  assert.equal(created, 2);
  assert.deepEqual(
    inserts.map((c) => c.params?.[0]),
    ['Rent due', 'Insurance due'],
  );
});
