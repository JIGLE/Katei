// Web Push subscription management. The browser subscribes with the household's
// VAPID public key, then registers its subscription here; reminders are delivered
// to it by the scheduler (see lib/notifications.ts checkAndNotify).

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { getVapidKeys } from '../lib/notifications.js';

interface SubBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export const pushRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/push/vapid — the public key the browser needs to subscribe.
  app.get('/vapid', async () => ({ publicKey: (await getVapidKeys()).publicKey }));

  // POST /api/push/subscribe — store (or refresh) this device's subscription.
  app.post<{ Body: SubBody }>(
    '/subscribe',
    {
      schema: {
        body: {
          type: 'object',
          required: ['endpoint', 'keys'],
          properties: {
            endpoint: { type: 'string', minLength: 1 },
            keys: {
              type: 'object',
              required: ['p256dh', 'auth'],
              properties: { p256dh: { type: 'string' }, auth: { type: 'string' } },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const userId = req.user?.id;
      if (!userId) return reply.code(401).send({ error: 'Not authenticated' });
      const ua = req.headers['user-agent'] ?? null;
      await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, endpoint)
         DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
        [userId, req.body.endpoint, req.body.keys.p256dh, req.body.keys.auth, ua],
      );
      return reply.code(201).send({ ok: true });
    },
  );

  // POST /api/push/unsubscribe — forget this device's subscription.
  app.post<{ Body: { endpoint: string } }>(
    '/unsubscribe',
    {
      schema: {
        body: { type: 'object', required: ['endpoint'], properties: { endpoint: { type: 'string' } } },
      },
    },
    async (req) => {
      const userId = req.user?.id;
      if (userId) {
        await query(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, req.body.endpoint]);
      }
      return { ok: true };
    },
  );
};
