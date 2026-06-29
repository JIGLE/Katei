// Notification settings + a manual test send. All routes require a session
// (mounted inside the authenticated group in index.ts).

import type { FastifyPluginAsync } from 'fastify';
import { getSettings, saveSettings, sendNtfy, checkAndNotify } from '../lib/notifications.js';

export const settingsRoutes: FastifyPluginAsync = async (app) => {
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
};
