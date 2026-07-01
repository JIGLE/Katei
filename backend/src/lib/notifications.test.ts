import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';

const { generateRecurringEvents, nextOccurrence } = await import('./notifications.js');
import type { query as Query } from '../db.js';

// --- generateRecurringEvents: DB logic via an injected fake query ----------

interface Call {
  text: string;
  params?: unknown[];
}

type TestStream = {
  id: number; name: string; frequency: string; stream_type: string; due_day: number; due_shift: string;
};
const stream = (over: Partial<TestStream> & { id: number; name: string }): TestStream => ({
  frequency: 'monthly', stream_type: 'expense', due_day: 1, due_shift: 'next', ...over,
});

/**
 * Build a fake `query` that returns the given streams, reports whether each
 * stream already has an upcoming event, records INSERTs, and answers the
 * country lookup.
 */
function fakeQuery(streams: TestStream[], hasUpcoming: (streamId: number) => boolean, country = 'DE') {
  const inserts: Call[] = [];
  const q = (async (text: string, params?: unknown[]) => {
    if (/FROM app_settings/.test(text)) return { rows: [{ value: country }] };
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

test('generates a "due" payment event for a recurring expense', async () => {
  const { q, inserts } = fakeQuery([stream({ id: 1, name: 'Rent' })], () => false);
  const created = await generateRecurringEvents(undefined, q);
  assert.equal(created, 1);
  assert.equal(inserts[0].params?.[0], 'Rent due');
  assert.equal(inserts[0].params?.[1], 'payment');
});

test('generates an income event titled with the stream name', async () => {
  const { q, inserts } = fakeQuery([stream({ id: 1, name: 'Salary', stream_type: 'income' })], () => false);
  await generateRecurringEvents(undefined, q);
  assert.equal(inserts[0].params?.[0], 'Salary');
  assert.equal(inserts[0].params?.[1], 'income');
});

test('generates a savings "set aside" event for a recurring savings stream', async () => {
  const { q, inserts } = fakeQuery([stream({ id: 1, name: 'Emergency fund', stream_type: 'savings' })], () => false);
  await generateRecurringEvents(undefined, q);
  assert.equal(inserts[0].params?.[0], 'Emergency fund');
  assert.equal(inserts[0].params?.[1], 'savings');
});

test('skips a stream that already has an upcoming event', async () => {
  const { q, inserts } = fakeQuery([stream({ id: 2, name: 'Netflix' })], () => true);
  const created = await generateRecurringEvents(undefined, q);
  assert.equal(created, 0);
  assert.equal(inserts.length, 0);
});

// --- nextOccurrence: business-day scheduling ------------------------------

test('nextOccurrence rolls a weekend/holiday day-1 to the first business day', () => {
  // Germany, from mid-Dec 2025 → next month is Jan 2026. Jan 1 (holiday) +
  // Jan 3/4 (weekend) → first business day is Jan 2, 2026 (a Friday).
  const d = nextOccurrence({ frequency: 'monthly', dueDay: 1, dueShift: 'next' }, 'DE', new Date(Date.UTC(2025, 11, 15)));
  assert.equal(d, '2026-01-02');
});

test('nextOccurrence with shift "none" keeps the exact day', () => {
  const d = nextOccurrence({ frequency: 'monthly', dueDay: 1, dueShift: 'none' }, 'DE', new Date(Date.UTC(2025, 11, 15)));
  assert.equal(d, '2026-01-01');
});

test('nextOccurrence clamps an out-of-range due day to month length', () => {
  // Day 31 in February → clamped to the 28th (2026 is not a leap year).
  const d = nextOccurrence({ frequency: 'monthly', dueDay: 31, dueShift: 'none' }, undefined, new Date(Date.UTC(2026, 0, 10)));
  assert.equal(d, '2026-02-28');
});
