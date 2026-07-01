// Notification settings + a manual test send. All routes require a session
// (mounted inside the authenticated group in index.ts).

import type { FastifyPluginAsync } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { getSettings, saveSettings, checkAndNotify, sendPush } from '../lib/notifications.js';
import type { PushSubRow } from '../lib/notifications.js';
import { listBackups, backupPath, runBackup } from '../lib/backups.js';
import { getSetting, setSetting, query } from '../db.js';
import { randomBytes } from 'node:crypto';

// EU-leaning defaults when a household hasn't set preferences yet.
const PREF_DEFAULTS = { country: 'DE', currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin' };

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/settings/preferences — household country / currency / locale / timezone / language.
  app.get('/preferences', async () => {
    const locale = (await getSetting('locale')) ?? PREF_DEFAULTS.locale;
    // UI language defaults to the locale's language, but is independently set.
    const language = (await getSetting('language')) ?? locale.split('-')[0].toLowerCase();
    return {
      country: (await getSetting('country')) ?? PREF_DEFAULTS.country,
      currency: (await getSetting('default_currency')) ?? PREF_DEFAULTS.currency,
      locale,
      timezone: (await getSetting('timezone')) ?? PREF_DEFAULTS.timezone,
      language,
      savings_goal: Number((await getSetting('savings_goal')) ?? 0),
      savings_opening: Number((await getSetting('savings_opening')) ?? 0),
      theme: (await getSetting('theme')) === 'light' ? 'light' : 'dark',
      household_name: (await getSetting('household_name')) ?? '',
    };
  });

  // PUT /api/settings/preferences
  app.put<{
    Body: { country: string; currency: string; locale: string; timezone: string; language: string; savings_goal?: number; savings_opening?: number; theme?: string; household_name?: string };
  }>(
    '/preferences',
    {
      schema: {
        body: {
          type: 'object',
          required: ['country', 'currency', 'locale', 'timezone'],
          properties: {
            country: { type: 'string', pattern: '^[A-Za-z]{2}$' },
            currency: { type: 'string', pattern: '^[A-Za-z]{3}$' },
            locale: { type: 'string', minLength: 2, maxLength: 35 },
            timezone: { type: 'string', minLength: 1, maxLength: 64 },
            language: { type: 'string', pattern: '^[A-Za-z]{2}$' },
            savings_goal: { type: 'number', minimum: 0 },
            savings_opening: { type: 'number', minimum: 0 },
            theme: { type: 'string', enum: ['dark', 'light'] },
            household_name: { type: 'string', maxLength: 60 },
          },
        },
      },
    },
    async (req) => {
      await setSetting('country', req.body.country.toUpperCase());
      await setSetting('default_currency', req.body.currency.toUpperCase());
      await setSetting('locale', req.body.locale);
      await setSetting('timezone', req.body.timezone);
      const language = (req.body.language || req.body.locale.split('-')[0]).toLowerCase();
      await setSetting('language', language);
      const savings_goal = req.body.savings_goal ?? 0;
      await setSetting('savings_goal', String(savings_goal));
      const savings_opening = req.body.savings_opening ?? 0;
      await setSetting('savings_opening', String(savings_opening));
      const theme = req.body.theme === 'light' ? 'light' : 'dark';
      await setSetting('theme', theme);
      const household_name = (req.body.household_name ?? '').trim();
      await setSetting('household_name', household_name);
      return {
        country: req.body.country.toUpperCase(),
        currency: req.body.currency.toUpperCase(),
        locale: req.body.locale,
        timezone: req.body.timezone,
        language,
        savings_goal,
        savings_opening,
        theme,
        household_name,
      };
    },
  );

  // GET /api/settings/calendar — the household's iCal feed token (created lazily).
  app.get('/calendar', async () => {
    let token = await getSetting('calendar_token');
    if (!token) {
      token = randomBytes(24).toString('base64url');
      await setSetting('calendar_token', token);
    }
    return { token };
  });

  // POST /api/settings/calendar/rotate — invalidate the old feed URL.
  app.post('/calendar/rotate', async () => {
    const token = randomBytes(24).toString('base64url');
    await setSetting('calendar_token', token);
    return { token };
  });

  // GET /api/settings/notifications — the reminder lead window.
  app.get('/notifications', async () => getSettings());

  // PUT /api/settings/notifications
  app.put<{ Body: { lead_days: number } }>(
    '/notifications',
    {
      schema: {
        body: {
          type: 'object',
          required: ['lead_days'],
          properties: { lead_days: { type: 'integer', minimum: 0, maximum: 60 } },
        },
      },
    },
    async (req) => {
      await saveSettings({ lead_days: req.body.lead_days });
      return getSettings();
    },
  );

  // POST /api/settings/notifications/test — push a test to this member's devices.
  app.post('/notifications/test', async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) return reply.code(401).send({ error: 'Not authenticated' });
    const { rows: subs } = await query<PushSubRow>(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
      [userId],
    );
    if (!subs.length) return reply.code(400).send({ error: 'No device is subscribed to notifications yet' });
    let delivered = 0;
    for (const sub of subs) {
      try {
        if ((await sendPush(sub, { title: 'Katei', body: 'Test notification 家庭', url: '/' })) === 'ok') delivered += 1;
      } catch { /* ignore a single device's failure */ }
    }
    if (!delivered) return reply.code(502).send({ error: 'Could not deliver to any device' });
    return { ok: true, delivered };
  });

  // POST /api/settings/notifications/run — trigger a due-soon sweep now.
  app.post('/notifications/run', async () => ({ sent: await checkAndNotify() }));

  // GET /api/settings/backups — list available database backups.
  app.get('/backups', async () => listBackups());

  // POST /api/settings/backups/run — take a backup now.
  app.post('/backups/run', async (_req, reply) => {
    const file = await runBackup(app.log);
    if (!file) return reply.code(500).send({ error: 'Backup failed' });
    return { file: file.split('/').pop() };
  });

  // GET /api/settings/backups/:name — download a backup file.
  app.get<{ Params: { name: string } }>('/backups/:name', async (req, reply) => {
    const full = backupPath(req.params.name);
    if (!full) return reply.code(400).send({ error: 'Invalid backup name' });
    if (!existsSync(full)) return reply.code(404).send({ error: 'Backup not found' });
    reply
      .header('Content-Type', 'application/sql')
      .header('Content-Disposition', `attachment; filename="${req.params.name}"`);
    return reply.send(createReadStream(full));
  });
};
