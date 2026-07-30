// Household activity feed — recent shared actions, newest first, joined with
// the actor's name + avatar for display. Read-only; rows are written by the
// domain routers via logActivity().

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const activityRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/activity?limit=20 — most recent household activity. An entry
  // about a private stream is omitted for everyone but its owner, the same
  // rule as the stream itself.
  app.get<{ Querystring: { limit?: string } }>('/', async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const { rows } = await query(
      `SELECT a.id, a.action, a.summary, a.created_at,
              a.actor_id, u.name AS actor_name, u.avatar_url AS actor_avatar
         FROM activity a
         LEFT JOIN users u ON u.id = a.actor_id
         LEFT JOIN money_streams s ON s.id = a.money_stream_id
        WHERE a.money_stream_id IS NULL OR s.private = FALSE OR s.owner_user_id = $2
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1`,
      [limit, req.user.id],
    );
    return rows;
  });
};
