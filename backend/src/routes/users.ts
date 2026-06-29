import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const usersRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/users
  app.get('/', async () => {
    const { rows } = await query(
      'SELECT id, name, avatar_url, created_at FROM users ORDER BY created_at ASC',
    );
    return rows;
  });

  // GET /api/users/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await query(
      'SELECT id, name, avatar_url, created_at FROM users WHERE id = $1',
      [req.params.id],
    );
    if (!rows.length) return reply.code(404).send({ error: 'User not found' });
    return rows[0];
  });

  // POST /api/users
  app.post<{ Body: { name: string; avatar_url?: string } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            avatar_url: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, avatar_url = null } = req.body;
      const { rows } = await query(
        'INSERT INTO users (name, avatar_url) VALUES ($1, $2) RETURNING *',
        [name, avatar_url],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/users/:id
  app.patch<{ Params: { id: string }; Body: { name?: string; avatar_url?: string } }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            avatar_url: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, avatar_url } = req.body;
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
      if (avatar_url !== undefined) { fields.push(`avatar_url = $${i++}`); values.push(avatar_url); }
      if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
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
