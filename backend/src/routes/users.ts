import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { requireAdmin, isAdmin } from '../lib/authz.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  const COLS = "id, name, email, avatar_url, ntfy_url, kind, to_char(birthday, 'YYYY-MM-DD') AS birthday, role, created_at";

  // GET /api/users
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT ${COLS} FROM users ORDER BY created_at ASC`,
    );
    return rows;
  });

  // GET /api/users/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await query(
      `SELECT ${COLS} FROM users WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) return reply.code(404).send({ error: 'User not found' });
    return rows[0];
  });

  // POST /api/users — add a (passwordless) household member or pet. Admin only.
  app.post<{ Body: { name: string; avatar_url?: string; ntfy_url?: string; kind?: string; birthday?: string } }>(
    '/',
    {
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            avatar_url: { type: 'string' },
            ntfy_url: { type: 'string', maxLength: 500 },
            kind: { type: 'string', enum: ['human', 'pet'] },
            birthday: { type: ['string', 'null'], format: 'date' },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, avatar_url = null, ntfy_url = null, kind = 'human', birthday = null } = req.body;
      const { rows } = await query(
        `INSERT INTO users (name, avatar_url, ntfy_url, kind, birthday) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
        [name, avatar_url, ntfy_url, kind, birthday || null],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/users/:id — a member may edit only their own profile; admins may
  // edit anyone. (Previously any member could rename any other member.)
  app.patch<{ Params: { id: string }; Body: { name?: string; email?: string; avatar_url?: string; ntfy_url?: string; kind?: string; birthday?: string | null } }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            email: { type: 'string', maxLength: 254 },
            avatar_url: { type: 'string' },
            ntfy_url: { type: 'string', maxLength: 500 },
            kind: { type: 'string', enum: ['human', 'pet'] },
            birthday: { type: ['string', 'null'], format: 'date' },
          },
        },
      },
    },
    async (req, reply) => {
      const targetId = Number(req.params.id);
      if (req.user.id !== targetId && !(await isAdmin(req.user.id))) {
        return reply.code(403).send({ error: 'You can only edit your own profile' });
      }
      const allowed = ['name', 'email', 'avatar_url', 'ntfy_url', 'kind', 'birthday'] as const;
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(req.body[key]);
        }
      }
      if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${COLS}`,
        values,
      );
      if (!rows.length) return reply.code(404).send({ error: 'User not found' });
      return rows[0];
    },
  );

  // DELETE /api/users/:id — admin only.
  app.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'User not found' });
    return reply.code(204).send();
  });
};
