// In-app notifications — the header bell. Each row is scoped to a user; the
// feed and unread count are per-session. ntfy remains a parallel push channel.

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

const COLS = 'id, type, title, body, event_id, read_at, created_at';

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/notifications?limit=30 — this member's recent notifications + unread count.
  app.get<{ Querystring: { limit?: string } }>('/', async (req) => {
    const userId = req.user?.id;
    if (!userId) return { items: [], unread: 0 };
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const { rows: items } = await query(
      `SELECT ${COLS} FROM notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`,
      [userId, limit],
    );
    const { rows: counts } = await query<{ unread: string }>(
      `SELECT count(*) AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
      [userId],
    );
    return { items, unread: Number(counts[0]?.unread ?? 0) };
  });

  // POST /api/notifications/read — mark the given ids read, or all when omitted.
  app.post<{ Body: { ids?: number[] } }>(
    '/read',
    {
      schema: {
        body: {
          type: 'object',
          properties: { ids: { type: 'array', items: { type: 'integer' } } },
        },
      },
    },
    async (req) => {
      const userId = req.user?.id;
      if (!userId) return { ok: true };
      const ids = req.body?.ids;
      if (ids && ids.length) {
        await query(
          `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
            WHERE user_id = $1 AND read_at IS NULL AND id = ANY($2::int[])`,
          [userId, ids],
        );
      } else {
        await query(
          `UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL`,
          [userId],
        );
      }
      return { ok: true };
    },
  );
};
