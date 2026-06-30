// Authorization guards. authenticate (in app.ts) verifies the session; these
// add role checks on top. requireAdmin reads the role from the DB rather than
// trusting the JWT, so a demotion takes effect immediately.

import type { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db.js';

export async function isAdmin(userId: number): Promise<boolean> {
  const { rows } = await query<{ role: string }>('SELECT role FROM users WHERE id = $1', [userId]);
  return rows[0]?.role === 'admin';
}

/** preHandler that 403s non-admins. Mount after the authenticate guard. */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!(await isAdmin(req.user.id))) {
    reply.code(403).send({ error: 'Admin only' });
  }
}
