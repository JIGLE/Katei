import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  const COLS = 'id, name, avatar_url, ntfy_url, created_at';

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

  // POST /api/users
  app.post<{ Body: { name: string; avatar_url?: string; ntfy_url?: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            avatar_url: { type: 'string' },
            ntfy_url: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, avatar_url = null, ntfy_url = null } = req.body;
      const { rows } = await query(
        `INSERT INTO users (name, avatar_url, ntfy_url) VALUES ($1, $2, $3) RETURNING ${COLS}`,
        [name, avatar_url, ntfy_url],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/users/:id
  app.patch<{ Params: { id: string }; Body: { name?: string; avatar_url?: string; ntfy_url?: string } }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            avatar_url: { type: 'string' },
            ntfy_url: { type: 'string', maxLength: 500 },
          },
        },
      },
    },
    async (req, reply) => {
      const allowed = ['name', 'avatar_url', 'ntfy_url'] as const;
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

  // DELETE /api/users/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'User not found' });
    return reply.code(204).send();
  });
};
