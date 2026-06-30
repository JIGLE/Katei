// Notification delivery via ntfy (https://ntfy.sh). The operator configures a
// topic URL; reminders for events due within the lead window are pushed once.

import type { FastifyBaseLogger } from 'fastify';
import Holidays from 'date-holidays';
import { query, getSetting, setSetting } from '../db.js';

export type DueShift = 'none' | 'prev' | 'next';

const URL_KEY = 'ntfy_url';
const LEAD_KEY = 'notify_lead_days';
const DEFAULT_LEAD_DAYS = 3;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

export interface NotificationSettings {
  ntfy_url: string;
  lead_days: number;
}

export async function getSettings(): Promise<NotificationSettings> {
  const url = (await getSetting(URL_KEY)) ?? '';
  const lead = await getSetting(LEAD_KEY);
  return { ntfy_url: url, lead_days: lead ? Number(lead) : DEFAULT_LEAD_DAYS };
}

export async function saveSettings(settings: NotificationSettings): Promise<void> {
  await setSetting(URL_KEY, settings.ntfy_url.trim());
  await setSetting(LEAD_KEY, String(settings.lead_days));
}

/** Send a single ntfy message. Throws on a non-2xx response. */
export async function sendNtfy(
  url: string,
  message: string,
  opts: { title?: string; tags?: string; priority?: string } = {},
): Promise<void> {
  if (!url) throw new Error('No ntfy URL configured');
  const headers: Record<string, string> = {};
  if (opts.title) headers['Title'] = opts.title;
  if (opts.tags) headers['Tags'] = opts.tags;
  if (opts.priority) headers['Priority'] = opts.priority;

  const res = await fetch(url, { method: 'POST', headers, body: message });
  if (!res.ok) {
    throw new Error(`ntfy responded ${res.status} ${await res.text().catch(() => '')}`.trim());
  }
}

interface DueEvent {
  id: number;
  title: string;
  event_type: string;
  target_date: string;
}

/**
 * Decide who receives an event's reminder: the assigned members who have set a
 * notification URL, de-duplicated. When an event has no such assignees, fall
 * back to the household-wide URL (when configured).
 */
export function resolveRecipients(householdUrl: string, assigneeUrls: string[]): string[] {
  const cleaned = Array.from(
    new Set(assigneeUrls.map((u) => (u ?? '').trim()).filter(Boolean)),
  );
  if (cleaned.length) return cleaned;
  const fallback = householdUrl.trim();
  return fallback ? [fallback] : [];
}

/**
 * Find incomplete events due within the lead window that haven't been notified,
 * push a reminder to each event's assignees (or the household URL as fallback),
 * and stamp notified_at. Returns the number of events notified.
 */
export async function checkAndNotify(log?: FastifyBaseLogger): Promise<number> {
  const { ntfy_url, lead_days } = await getSettings();

  const { rows } = await query<DueEvent>(
    `SELECT id, title, event_type, target_date
       FROM household_events
      WHERE is_completed = FALSE
        AND notified_at IS NULL
        AND target_date <= CURRENT_DATE + ($1 || ' days')::interval
      ORDER BY target_date ASC`,
    [String(lead_days)],
  );

  let sent = 0;
  for (const ev of rows) {
    // Notification URLs of members assigned to this event.
    const { rows: assignees } = await query<{ ntfy_url: string }>(
      `SELECT DISTINCT u.ntfy_url
         FROM assignments a
         JOIN users u ON u.id = a.user_id
        WHERE a.event_id = $1 AND u.ntfy_url IS NOT NULL AND u.ntfy_url <> ''`,
      [ev.id],
    );
    const recipients = resolveRecipients(ntfy_url, assignees.map((a) => a.ntfy_url));
    if (recipients.length === 0) continue; // nobody to notify for this event

    const date = new Date(ev.target_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    let delivered = false;
    for (const url of recipients) {
      try {
        await sendNtfy(url, `${ev.title} — due ${date}`, {
          title: 'Katei reminder',
          tags: 'calendar',
        });
        delivered = true;
      } catch (err) {
        log?.error({ err, eventId: ev.id }, 'Failed to send reminder');
      }
    }
    // Stamp once per event so a delivered reminder isn't repeated next sweep.
    if (delivered) {
      await query(`UPDATE household_events SET notified_at = CURRENT_TIMESTAMP WHERE id = $1`, [ev.id]);
      sent += 1;
    }
  }
  if (sent && log) log.info(`Sent reminders for ${sent} event(s).`);
  return sent;
}

function isWeekend(d: Date): boolean {
  const g = d.getUTCDay();
  return g === 0 || g === 6;
}

function isBusinessDay(d: Date, hd: Holidays | null): boolean {
  if (isWeekend(d)) return false;
  if (hd) {
    const h = hd.isHoliday(d);
    if (Array.isArray(h) && h.some((x) => x.type === 'public')) return false;
  }
  return true;
}

/**
 * Concrete next occurrence date (YYYY-MM-DD) for a recurring stream:
 * monthly → `dueDay` of next month (clamped to month length); yearly → `dueDay`
 * of next January. The result is then shifted to a business day per `dueShift`,
 * skipping weekends and the country's public holidays. Pure (no DB / no I/O).
 */
export function nextOccurrence(
  opts: { frequency: string; dueDay: number; dueShift: DueShift },
  country?: string,
  fromDate: Date = new Date(),
): string {
  const { frequency, dueDay, dueShift } = opts;
  const anchorYear = fromDate.getUTCFullYear();
  const anchorMonth = frequency === 'yearly' ? 12 : fromDate.getUTCMonth() + 1; // next Jan / next month
  const y = anchorYear + Math.floor(anchorMonth / 12);
  const mo = anchorMonth % 12;
  const daysInMonth = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay || 1, 1), daysInMonth);
  let d = new Date(Date.UTC(y, mo, day));

  if (dueShift !== 'none') {
    let hd: Holidays | null = null;
    try {
      hd = country ? new Holidays(country.toUpperCase()) : null;
    } catch {
      hd = null;
    }
    const step = dueShift === 'prev' ? -1 : 1;
    let guard = 0;
    while (!isBusinessDay(d, hd) && guard < 14) {
      d = new Date(d.getTime() + step * 86_400_000);
      guard += 1;
    }
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Ensure every recurring income/expense stream has a future incomplete event so
 * the user doesn't add "Rent due" / "Salary" by hand each month. Dates land on a
 * business day (see nextOccurrence). Savings streams are skipped (no obligation).
 * Returns the count created.
 */
export async function generateRecurringEvents(
  log?: FastifyBaseLogger,
  q: typeof query = query,
): Promise<number> {
  const { rows: streams } = await q<{
    id: number; name: string; frequency: string; stream_type: string; due_day: number; due_shift: string;
  }>(
    `SELECT id, name, frequency, stream_type, due_day, due_shift
       FROM money_streams
      WHERE is_recurring = TRUE AND frequency IN ('monthly', 'yearly')
        AND stream_type IN ('income', 'expense')
        AND automated = FALSE`,
  );
  const country = (await q<{ value: string }>(
    `SELECT value FROM app_settings WHERE key = 'country'`,
  )).rows[0]?.value;

  let created = 0;
  for (const s of streams) {
    const { rows: existing } = await q<{ count: string }>(
      `SELECT count(*) AS count FROM household_events
        WHERE money_stream_id = $1 AND target_date >= CURRENT_DATE AND is_completed = FALSE`,
      [s.id],
    );
    if (Number(existing[0].count) > 0) continue;

    const date = nextOccurrence(
      { frequency: s.frequency, dueDay: s.due_day, dueShift: s.due_shift as DueShift },
      country,
    );
    const isIncome = s.stream_type === 'income';
    await q(
      `INSERT INTO household_events (title, event_type, target_date, money_stream_id)
       VALUES ($1, $2, $3, $4)`,
      [isIncome ? s.name : `${s.name} due`, isIncome ? 'income' : 'payment', date, s.id],
    );
    created += 1;
    log?.info(`Generated recurring event for stream "${s.name}"`);
  }
  if (created && log) log.info(`Generated ${created} recurring event(s).`);
  return created;
}

/**
 * Start the hourly background sweep: generate any missing recurring events,
 * then push reminders for events due within the lead window. Runs once shortly
 * after boot.
 */
export function startScheduler(log: FastifyBaseLogger): void {
  const run = async () => {
    try {
      await generateRecurringEvents(log);
      await checkAndNotify(log);
    } catch (err) {
      log.error({ err }, 'Scheduler sweep failed');
    }
  };
  setTimeout(run, 10_000); // initial run after startup settles
  setInterval(run, CHECK_INTERVAL_MS);
}
