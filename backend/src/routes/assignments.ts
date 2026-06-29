import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

export const assignmentsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/assignments — joined with user name for display convenience.
  // Query params: ?user_id=  ?event_id=  ?money_stream_id=
  app.get<{
    Querystring: { user_id?: string; event_id?: string; money_stream_id?: string };
  }>('/', async (req) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (req.query.user_id) { conditions.push(`a.user_id = $${i++}`); values.push(req.query.user_id); }
    if (req.query.event_id) { conditions.push(`a.event_id = $${i++}`); values.push(req.query.event_id); }
    if (req.query.money_stream_id) { conditions.push(`a.money_stream_id = $${i++}`); values.push(req.query.money_stream_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT a.id, a.user_id, a.event_id, a.money_stream_id, a.role,
              u.name AS user_name, u.avatar_url AS user_avatar
       FROM assignments a
       LEFT JOIN users u ON u.id = a.user_id
       ${where}
       ORDER BY a.id ASC`,
      values,
    );
    return rows;
  });

  // GET /api/assignments/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await query(
      `SELECT a.id, a.user_id, a.event_id, a.money_stream_id, a.role,
              u.name AS user_name, u.avatar_url AS user_avatar
       FROM assignments a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.id = $1`,
      [req.params.id],
    );
    if (!rows.length) return reply.code(404).send({ error: 'Assignment not found' });
    return rows[0];
  });

  // POST /api/assignments
  app.post<{
    Body: {
      user_id: number;
      event_id?: number;
      money_stream_id?: number;
      role?: string;
    };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['user_id'],
          properties: {
            user_id: { type: 'integer' },
            event_id: { type: 'integer' },
            money_stream_id: { type: 'integer' },
            role: { type: 'string', maxLength: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      const { user_id, event_id = null, money_stream_id = null, role = 'owner' } = req.body;
      const { rows } = await query(
        `INSERT INTO assignments (user_id, event_id, money_stream_id, role)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, event_id, money_stream_id, role`,
        [user_id, event_id, money_stream_id, role],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/assignments/:id — update role
  app.patch<{ Params: { id: string }; Body: { role: string } }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          required: ['role'],
          properties: { role: { type: 'string', maxLength: 50 } },
        },
      },
    },
    async (req, reply) => {
      const { rows } = await query(
        `UPDATE assignments SET role = $1 WHERE id = $2
         RETURNING id, user_id, event_id, money_stream_id, role`,
        [req.body.role, req.params.id],
      );
      if (!rows.length) return reply.code(404).send({ error: 'Assignment not found' });
      return rows[0];
    },
  );

  // DELETE /api/assignments/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM assignments WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Assignment not found' });
    return reply.code(204).send();
  });
};
