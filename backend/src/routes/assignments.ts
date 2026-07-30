import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { visibleEventOrNull, visibleStreamOrNull } from '../lib/privacy.js';

// An assignment is invisible whenever what it points at is: either directly
// (money_stream_id names a private stream someone else owns) or indirectly
// (event_id names an event linked to one). Both hops are LEFT JOINs so a null
// money_stream_id — the common case — never excludes a row.
async function visibleAssignmentOrNull(id: string, viewerId: number): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(
    `SELECT a.id FROM assignments a
       LEFT JOIN money_streams sm ON sm.id = a.money_stream_id
       LEFT JOIN household_events he ON he.id = a.event_id
       LEFT JOIN money_streams se ON se.id = he.money_stream_id
      WHERE a.id = $1
        AND (a.money_stream_id IS NULL OR sm.private = FALSE OR sm.owner_user_id = $2)
        AND (he.money_stream_id IS NULL OR se.private = FALSE OR se.owner_user_id = $2)`,
    [id, viewerId],
  );
  return rows[0] ?? null;
}

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
    // A phantom assignment pointing at a private stream/event — directly, or
    // indirectly through the event it's for — must not leak, including via
    // the query filters above (e.g. ?event_id= probing).
    conditions.push(`(a.money_stream_id IS NULL OR sm.private = FALSE OR sm.owner_user_id = $${i++})`);
    values.push(req.user.id);
    conditions.push(`(he.money_stream_id IS NULL OR se.private = FALSE OR se.owner_user_id = $${i++})`);
    values.push(req.user.id);

    const { rows } = await query(
      `SELECT a.id, a.user_id, a.event_id, a.money_stream_id, a.role,
              u.name AS user_name, u.avatar_url AS user_avatar
       FROM assignments a
       LEFT JOIN users u ON u.id = a.user_id
       LEFT JOIN money_streams sm ON sm.id = a.money_stream_id
       LEFT JOIN household_events he ON he.id = a.event_id
       LEFT JOIN money_streams se ON se.id = he.money_stream_id
       WHERE ${conditions.join(' AND ')}
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
       LEFT JOIN money_streams sm ON sm.id = a.money_stream_id
       LEFT JOIN household_events he ON he.id = a.event_id
       LEFT JOIN money_streams se ON se.id = he.money_stream_id
       WHERE a.id = $1
         AND (a.money_stream_id IS NULL OR sm.private = FALSE OR sm.owner_user_id = $2)
         AND (he.money_stream_id IS NULL OR se.private = FALSE OR se.owner_user_id = $2)`,
      [req.params.id, req.user.id],
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
            // Nullable so an explicit null isn't coerced to 0 (a non-existent FK).
            event_id: { type: ['integer', 'null'] },
            money_stream_id: { type: ['integer', 'null'] },
            role: { type: 'string', maxLength: 50 },
          },
        },
      },
    },
    async (req, reply) => {
      const { user_id, event_id = null, money_stream_id = null, role = 'owner' } = req.body;
      if (event_id != null && !(await visibleEventOrNull(event_id, req.user.id))) {
        return reply.code(400).send({ error: 'A linked item no longer exists.' });
      }
      if (money_stream_id != null && !(await visibleStreamOrNull(money_stream_id, req.user.id))) {
        return reply.code(400).send({ error: 'A linked item no longer exists.' });
      }
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
      if (!(await visibleAssignmentOrNull(req.params.id, req.user.id))) {
        return reply.code(404).send({ error: 'Assignment not found' });
      }
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
    if (!(await visibleAssignmentOrNull(req.params.id, req.user.id))) {
      return reply.code(404).send({ error: 'Assignment not found' });
    }
    const { rowCount } = await query('DELETE FROM assignments WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Assignment not found' });
    return reply.code(204).send();
  });
};
