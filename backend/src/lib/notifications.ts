// Reminder delivery via Web Push (VAPID). Members subscribe a device/browser and
// reminders for events due within the lead window are pushed once. The in-app
// bell (notifications table) is the always-on channel; push delivers the same
// content to the lock screen.

import type { FastifyBaseLogger } from 'fastify';
import Holidays from 'date-holidays';
import webpush from 'web-push';
import { query, getSetting, setSetting } from '../db.js';

export type DueShift = 'none' | 'prev' | 'next';

const LEAD_KEY = 'notify_lead_days';
const VAPID_PUBLIC_KEY = 'push_vapid_public';
const VAPID_PRIVATE_KEY = 'push_vapid_private';
const VAPID_SUBJECT = 'mailto:katei@localhost';
const DEFAULT_LEAD_DAYS = 3;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly

export interface NotificationSettings {
  lead_days: number;
}

export async function getSettings(): Promise<NotificationSettings> {
  const lead = await getSetting(LEAD_KEY);
  return { lead_days: lead ? Number(lead) : DEFAULT_LEAD_DAYS };
}

export async function saveSettings(settings: NotificationSettings): Promise<void> {
  await setSetting(LEAD_KEY, String(settings.lead_days));
}

/**
 * The household's VAPID keypair, generated and persisted on first use so push
 * works with no operator config and survives restarts. The public key is safe to
 * hand the browser; the private key stays in app_settings.
 */
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  let publicKey = await getSetting(VAPID_PUBLIC_KEY);
  let privateKey = await getSetting(VAPID_PRIVATE_KEY);
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    await setSetting(VAPID_PUBLIC_KEY, publicKey);
    await setSetting(VAPID_PRIVATE_KEY, privateKey);
  }
  return { publicKey, privateKey };
}

let vapidConfigured = false;
async function configurePush(): Promise<void> {
  if (vapidConfigured) return;
  const { publicKey, privateKey } = await getVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
  vapidConfigured = true;
}

export interface PushSubRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send one Web Push message. Returns 'gone' when the subscription is dead (404/
 * 410) so the caller can prune it; throws on other (transient) errors.
 */
export async function sendPush(sub: PushSubRow, payload: object): Promise<'ok' | 'gone'> {
  await configurePush();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
    );
    return 'ok';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return 'gone';
    throw err;
  }
}

interface DueEvent {
  id: number;
  title: string;
  event_type: string;
  target_date: string;
}

/**
 * Record an in-app notification (the header bell). Failures are swallowed — a
 * notification is a nicety and must never sink the operation that raised it.
 */
export async function createNotification(
  userId: number,
  type: string,
  title: string,
  body: string | null = null,
  eventId: number | null = null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, event_id) VALUES ($1, $2, $3, $4, $5)`,
      [userId, type, title, body, eventId],
    );
  } catch {
    // Intentionally ignored.
  }
}

/**
 * Find incomplete events due within the lead window that haven't been notified,
 * raise an in-app notification for each event's assignees (or every account when
 * unassigned), push to those members' subscribed devices, and stamp notified_at.
 * The in-app bell works even with no push subscriptions. Returns events processed.
 */
export async function checkAndNotify(log?: FastifyBaseLogger): Promise<number> {
  const { lead_days } = await getSettings();

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
    // Members assigned to this event, or every account-holding member when the
    // event isn't assigned to anyone (a household-wide reminder).
    const { rows: assignees } = await query<{ id: number }>(
      `SELECT DISTINCT u.id FROM assignments a JOIN users u ON u.id = a.user_id WHERE a.event_id = $1`,
      [ev.id],
    );
    let targetIds = assignees.map((a) => a.id);
    if (targetIds.length === 0) {
      const { rows: all } = await query<{ id: number }>(
        `SELECT id FROM users WHERE password_hash IS NOT NULL`,
      );
      targetIds = all.map((u) => u.id);
    }

    const date = new Date(ev.target_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const body = `Due ${date}`;
    for (const uid of targetIds) {
      await createNotification(uid, 'reminder', ev.title, body, ev.id);
    }

    // Web Push to those members' subscribed devices; prune dead subscriptions.
    if (targetIds.length) {
      const { rows: subs } = await query<PushSubRow>(
        `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::int[])`,
        [targetIds],
      );
      for (const sub of subs) {
        try {
          if ((await sendPush(sub, { title: ev.title, body, url: '/timeline' })) === 'gone') {
            await query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
          }
        } catch (err) {
          log?.error({ err, eventId: ev.id }, 'Failed to send push');
        }
      }
    }

    // Stamp once per event so it isn't raised again next sweep.
    await query(`UPDATE household_events SET notified_at = CURRENT_TIMESTAMP WHERE id = $1`, [ev.id]);
    sent += 1;
  }
  if (sent && log) log.info(`Notified for ${sent} event(s).`);
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
 * Ensure every recurring income/expense/savings stream has a future incomplete
 * event so the user doesn't add "Rent due" / "Salary" / a set-aside by hand each
 * month. Dates land on a business day (see nextOccurrence). Confirming a savings
 * event posts to the savings ledger. Returns the count created.
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
        AND stream_type IN ('income', 'expense', 'savings')
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
    // Title + event_type read differently per stream kind: income arrives,
    // expenses fall due, savings get set aside (confirming posts to the ledger).
    const { title, eventType } =
      s.stream_type === 'income'
        ? { title: s.name, eventType: 'income' }
        : s.stream_type === 'savings'
          ? { title: s.name, eventType: 'savings' }
          : { title: `${s.name} due`, eventType: 'payment' };
    await q(
      `INSERT INTO household_events (title, event_type, target_date, money_stream_id)
       VALUES ($1, $2, $3, $4)`,
      [title, eventType, date, s.id],
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
