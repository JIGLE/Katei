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
 * Find incomplete events due within the lead window that haven't been notified,
 * push a reminder for each, and stamp notified_at. Returns the count sent.
 */
export async function checkAndNotify(log?: FastifyBaseLogger): Promise<number> {
  const { ntfy_url, lead_days } = await getSettings();
  if (!ntfy_url) return 0;

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
    const date = new Date(ev.target_date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    try {
      await sendNtfy(ntfy_url, `${ev.title} — due ${date}`, {
        title: 'Katei reminder',
        tags: 'calendar',
      });
      await query(`UPDATE household_events SET notified_at = CURRENT_TIMESTAMP WHERE id = $1`, [ev.id]);
      sent += 1;
    } catch (err) {
      log?.error({ err, eventId: ev.id }, 'Failed to send reminder');
    }
  }
  if (sent && log) log.info(`Sent ${sent} reminder(s).`);
  return sent;
}

/** Start the hourly reminder scheduler. Runs once shortly after boot. */
export function startScheduler(log: FastifyBaseLogger): void {
  const run = () => {
    checkAndNotify(log).catch((err) => log.error({ err }, 'Reminder check failed'));
  };
  setTimeout(run, 10_000); // initial run after startup settles
  setInterval(run, CHECK_INTERVAL_MS);
}
