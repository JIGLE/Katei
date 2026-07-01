// iCalendar (RFC 5545) feed generation. Pure and side-effect free so it can be
// unit-tested; the route wraps it with a token check and the DB query.

export interface CalEvent {
  id: number;
  title: string;
  event_type: string;
  target_date: string; // 'YYYY-MM-DD' (or ISO — only the date part is used)
  description?: string | null;
}

// Escape per RFC 5545 §3.3.11 (TEXT): backslash, semicolon, comma, newline.
function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

// A UTC timestamp as YYYYMMDDTHHMMSSZ.
function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Build an all-day VEVENT calendar for the given household events. `now` is
 * injectable for deterministic tests. Lines are CRLF-terminated per spec.
 */
export function buildICS(events: CalEvent[], opts: { name?: string; now?: Date } = {}): string {
  const now = opts.now ?? new Date();
  const dtstamp = stamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Katei//Household//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(opts.name ?? 'Katei')}`,
  ];
  for (const ev of events) {
    const date = ev.target_date.slice(0, 10).replace(/-/g, '');
    lines.push(
      'BEGIN:VEVENT',
      `UID:katei-event-${ev.id}@katei`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${esc(ev.title)}`,
    );
    if (ev.description) lines.push(`DESCRIPTION:${esc(ev.description)}`);
    lines.push(`CATEGORIES:${esc(ev.event_type)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
