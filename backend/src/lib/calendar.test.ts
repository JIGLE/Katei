import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildICS } from './calendar.js';

const NOW = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));

test('buildICS wraps events in a valid VCALENDAR with all-day VEVENTs', () => {
  const ics = buildICS(
    [{ id: 5, title: 'Rent due', event_type: 'payment', target_date: '2026-07-01', description: null }],
    { now: NOW },
  );
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.ok(ics.includes('UID:katei-event-5@katei'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20260701'));
  assert.ok(ics.includes('SUMMARY:Rent due'));
  assert.ok(ics.includes('DTSTAMP:20260701T120000Z'));
});

test('buildICS escapes TEXT special characters', () => {
  const ics = buildICS(
    [{ id: 1, title: 'Pay; rent, now', event_type: 'payment', target_date: '2026-07-01' }],
    { now: NOW },
  );
  assert.ok(ics.includes('SUMMARY:Pay\\; rent\\, now'));
});
