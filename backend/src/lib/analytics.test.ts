import { test } from 'node:test';
import assert from 'node:assert/strict';

import { monthKeys, windowStart, buildMonthlySpend } from './analytics.js';

const FROM = new Date(Date.UTC(2026, 5, 15)); // 2026-06-15

test('monthKeys returns the last N months ending with fromDate month', () => {
  assert.deepEqual(monthKeys(6, FROM), [
    '2026-01',
    '2026-02',
    '2026-03',
    '2026-04',
    '2026-05',
    '2026-06',
  ]);
});

test('monthKeys spans a year boundary', () => {
  assert.deepEqual(monthKeys(3, new Date(Date.UTC(2026, 0, 10))), [
    '2025-11',
    '2025-12',
    '2026-01',
  ]);
});

test('windowStart is the first day of the earliest month in the window', () => {
  assert.equal(windowStart(6, FROM), '2026-01-01');
});

test('buildMonthlySpend produces a dense series, filling missing months with 0', () => {
  const rows = [
    { month: '2026-04', total: '1200.00' },
    { month: '2026-06', total: 1500 },
  ];
  assert.deepEqual(buildMonthlySpend(rows, 6, FROM), [
    { month: '2026-01', total: 0 },
    { month: '2026-02', total: 0 },
    { month: '2026-03', total: 0 },
    { month: '2026-04', total: 1200 },
    { month: '2026-05', total: 0 },
    { month: '2026-06', total: 1500 },
  ]);
});

test('buildMonthlySpend ignores rows outside the window and coerces bad totals to 0', () => {
  const rows = [
    { month: '2025-12', total: '999' }, // before window
    { month: '2026-06', total: 'not-a-number' },
  ];
  assert.deepEqual(buildMonthlySpend(rows, 2, FROM), [
    { month: '2026-05', total: 0 },
    { month: '2026-06', total: 0 },
  ]);
});
