// Notification delivery via ntfy (https://ntfy.sh). The operator configures a
// topic URL; reminders for events due within the lead window are pushed once.

import type { FastifyBaseLogger } from 'fastify';
import { query, getSetting, setSetting } from '../db.js';

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

/**
 * Ensure every recurring money stream has a future incomplete event so the user
 * doesn't have to add "Rent due" by hand each month. For each monthly/yearly
 * stream with no upcoming linked event, create one dated at the start of the
 * next period. Returns the count created.
 */
export async function generateRecurringEvents(
  log?: FastifyBaseLogger,
  q: typeof query = query,
): Promise<number> {
  const { rows: streams } = await q<{ id: number; name: string; frequency: string }>(
    `SELECT id, name, frequency
       FROM money_streams
      WHERE is_recurring = TRUE AND frequency IN ('monthly', 'yearly')`,
  );

  let created = 0;
  for (const s of streams) {
    // First of next month, or Jan 1 of next year. Both inlined (no params) since
    // they are fixed SQL expressions, not user input.
    const nextDate =
      s.frequency === 'monthly'
        ? `date_trunc('month', CURRENT_DATE + interval '1 month')::date`
        : `date_trunc('year', CURRENT_DATE + interval '1 year')::date`;

    const { rows: existing } = await q<{ count: string }>(
      `SELECT count(*) AS count FROM household_events
        WHERE money_stream_id = $1 AND target_date >= CURRENT_DATE AND is_completed = FALSE`,
      [s.id],
    );
    if (Number(existing[0].count) > 0) continue;

    await q(
      `INSERT INTO household_events (title, event_type, target_date, money_stream_id)
       VALUES ($1, 'payment', ${nextDate}, $2)`,
      [`${s.name} due`, s.id],
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
