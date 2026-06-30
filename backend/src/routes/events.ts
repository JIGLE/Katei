import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

const COLS =
  'id, title, description, event_type, target_date, is_completed, money_stream_id, created_at';

export const eventsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/events
  // Query params: ?upcoming=true  — only future incomplete events
  //               ?type=deadline|payment|appointment
  app.get<{ Querystring: { upcoming?: string; type?: string } }>('/', async (req) => {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (req.query.upcoming === 'true') {
      conditions.push(`target_date >= CURRENT_DATE AND is_completed = FALSE`);
    }
    if (req.query.type) {
      conditions.push(`event_type = $${i++}`);
      values.push(req.query.type);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT ${COLS} FROM household_events ${where} ORDER BY target_date ASC`,
      values,
    );
    return rows;
  });

  // GET /api/events/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await query(
      `SELECT ${COLS} FROM household_events WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) return reply.code(404).send({ error: 'Event not found' });
    return rows[0];
  });

  // POST /api/events
  app.post<{
    Body: {
      title: string;
      description?: string;
      event_type: string;
      target_date: string;
      money_stream_id?: number;
    };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title', 'event_type', 'target_date'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string' },
            event_type: { type: 'string', enum: ['deadline', 'payment', 'appointment', 'income'] },
            target_date: { type: 'string', format: 'date' },
            money_stream_id: { type: 'integer' },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        title,
        description = null,
        event_type,
        target_date,
        money_stream_id = null,
      } = req.body;
      const { rows } = await query(
        `INSERT INTO household_events (title, description, event_type, target_date, money_stream_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
        [title, description, event_type, target_date, money_stream_id],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/events/:id — general update
  app.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      event_type?: string;
      target_date?: string;
      is_completed?: boolean;
      money_stream_id?: number | null;
    };
  }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string' },
            event_type: { type: 'string', enum: ['deadline', 'payment', 'appointment', 'income'] },
            target_date: { type: 'string', format: 'date' },
            is_completed: { type: 'boolean' },
            money_stream_id: { type: ['integer', 'null'] },
          },
        },
      },
    },
    async (req, reply) => {
      const allowed = [
        'title', 'description', 'event_type', 'target_date', 'is_completed', 'money_stream_id',
      ] as const;
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
        `UPDATE household_events SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${COLS}`,
        values,
      );
      if (!rows.length) return reply.code(404).send({ error: 'Event not found' });
      return rows[0];
    },
  );

  // PATCH /api/events/:id/complete — toggle completion
  app.patch<{ Params: { id: string }; Body: { is_completed: boolean } }>(
    '/:id/complete',
    {
      schema: {
        body: {
          type: 'object',
          required: ['is_completed'],
          properties: { is_completed: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const { rows } = await query(
        `UPDATE household_events SET is_completed = $1 WHERE id = $2 RETURNING ${COLS}`,
        [req.body.is_completed, req.params.id],
      );
      if (!rows.length) return reply.code(404).send({ error: 'Event not found' });
      return rows[0];
    },
  );

  // DELETE /api/events/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM household_events WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Event not found' });
    return reply.code(204).send();
  });
};
