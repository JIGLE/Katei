// Notification settings + a manual test send. All routes require a session
// (mounted inside the authenticated group in index.ts).

import type { FastifyPluginAsync } from 'fastify';
import { createReadStream, existsSync } from 'node:fs';
import { getSettings, saveSettings, sendNtfy, checkAndNotify } from '../lib/notifications.js';
import { listBackups, backupPath, runBackup } from '../lib/backups.js';
import { getSetting, setSetting } from '../db.js';

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
    };
  });

  // PUT /api/settings/preferences
  app.put<{
    Body: { country: string; currency: string; locale: string; timezone: string; language: string; savings_goal?: number };
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
      return {
        country: req.body.country.toUpperCase(),
        currency: req.body.currency.toUpperCase(),
        locale: req.body.locale,
        timezone: req.body.timezone,
        language,
        savings_goal,
      };
    },
  );

  // GET /api/settings/notifications
  app.get('/notifications', async () => getSettings());

  // PUT /api/settings/notifications
  app.put<{ Body: { ntfy_url: string; lead_days: number } }>(
    '/notifications',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ntfy_url', 'lead_days'],
          properties: {
            ntfy_url: { type: 'string', maxLength: 500 },
            lead_days: { type: 'integer', minimum: 0, maximum: 60 },
          },
        },
      },
    },
    async (req) => {
      await saveSettings({ ntfy_url: req.body.ntfy_url, lead_days: req.body.lead_days });
      return getSettings();
    },
  );

  // POST /api/settings/notifications/test — send a test push to the saved URL.
  app.post('/notifications/test', async (_req, reply) => {
    const { ntfy_url } = await getSettings();
    if (!ntfy_url) return reply.code(400).send({ error: 'No notification URL configured' });
    try {
      await sendNtfy(ntfy_url, 'Test reminder from Katei 家庭', {
        title: 'Katei',
        tags: 'white_check_mark',
      });
      return { ok: true };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : 'Send failed' });
    }
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
