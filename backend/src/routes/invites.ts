// Admin-only invite management. Invites are one-time codes a new member
// redeems at registration (see auth.ts). Redemption / validation is public and
// lives in authRoutes; everything here requires an admin session.

import type { FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'node:crypto';
import { query } from '../db.js';
import { requireAdmin } from '../lib/authz.js';

export const invitesRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin);

  // GET /api/invites — most recent first, with redeemer/creator names.
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT i.id, i.code, i.role, i.expires_at, i.used_at, i.created_at,
              c.name AS created_by_name, u.name AS used_by_name,
              (i.used_at IS NULL AND (i.expires_at IS NULL OR i.expires_at > CURRENT_TIMESTAMP)) AS active
         FROM invites i
         LEFT JOIN users c ON c.id = i.created_by
         LEFT JOIN users u ON u.id = i.used_by
        ORDER BY i.created_at DESC`,
    );
    return rows;
  });

  // POST /api/invites — mint a new code (default member, 14-day expiry).
  app.post<{ Body: { role?: string; expires_in_days?: number } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['admin', 'member'] },
            expires_in_days: { type: 'integer', minimum: 1, maximum: 90 },
          },
        },
      },
    },
    async (req, reply) => {
      const role = req.body.role === 'admin' ? 'admin' : 'member';
      const days = req.body.expires_in_days ?? 14;
      const code = randomBytes(16).toString('base64url');
      const { rows } = await query(
        `INSERT INTO invites (code, role, created_by, expires_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP + ($4 || ' days')::interval)
         RETURNING id, code, role, expires_at, created_at`,
        [code, role, req.user.id, String(days)],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // DELETE /api/invites/:id — revoke an unused code.
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM invites WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Invite not found' });
    return reply.code(204).send();
  });
};
