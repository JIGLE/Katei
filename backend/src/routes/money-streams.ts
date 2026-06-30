import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';

const COLS =
  'id, name, amount, currency, is_recurring, frequency, category, stream_type, due_day, due_shift, created_at';

export const moneyStreamsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/money-streams
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT ${COLS} FROM money_streams ORDER BY created_at DESC`,
    );
    return rows;
  });

  // GET /api/money-streams/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await query(
      `SELECT ${COLS} FROM money_streams WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) return reply.code(404).send({ error: 'Money stream not found' });
    return rows[0];
  });

  // POST /api/money-streams
  app.post<{
    Body: {
      name: string;
      amount: number;
      currency?: string;
      is_recurring?: boolean;
      frequency?: string;
      category?: string;
      stream_type?: string;
      due_day?: number;
      due_shift?: string;
    };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'amount'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            amount: { type: 'number', minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            is_recurring: { type: 'boolean' },
            frequency: { type: 'string', enum: ['monthly', 'yearly', 'one-off'] },
            category: { type: 'string', maxLength: 100 },
            stream_type: { type: 'string', enum: ['income', 'expense', 'savings'] },
            due_day: { type: 'integer', minimum: 1, maximum: 31 },
            due_shift: { type: 'string', enum: ['none', 'prev', 'next'] },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        name,
        amount,
        currency = 'USD',
        is_recurring = true,
        frequency = 'monthly',
        category = null,
        stream_type = 'expense',
        due_day = 1,
        due_shift = 'next',
      } = req.body;
      const { rows } = await query(
        `INSERT INTO money_streams (name, amount, currency, is_recurring, frequency, category, stream_type, due_day, due_shift)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLS}`,
        [name, amount, currency, is_recurring, frequency, category, stream_type, due_day, due_shift],
      );
      return reply.code(201).send(rows[0]);
    },
  );

  // PATCH /api/money-streams/:id
  app.patch<{
    Params: { id: string };
    Body: {
      name?: string;
      amount?: number;
      currency?: string;
      is_recurring?: boolean;
      frequency?: string;
      category?: string;
      stream_type?: string;
      due_day?: number;
      due_shift?: string;
    };
  }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            amount: { type: 'number', minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            is_recurring: { type: 'boolean' },
            frequency: { type: 'string', enum: ['monthly', 'yearly', 'one-off'] },
            category: { type: 'string', maxLength: 100 },
            stream_type: { type: 'string', enum: ['income', 'expense', 'savings'] },
            due_day: { type: 'integer', minimum: 1, maximum: 31 },
            due_shift: { type: 'string', enum: ['none', 'prev', 'next'] },
          },
        },
      },
    },
    async (req, reply) => {
      const allowed = ['name', 'amount', 'currency', 'is_recurring', 'frequency', 'category', 'stream_type', 'due_day', 'due_shift'] as const;
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
        `UPDATE money_streams SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${COLS}`,
        values,
      );
      if (!rows.length) return reply.code(404).send({ error: 'Money stream not found' });
      return rows[0];
    },
  );

  // DELETE /api/money-streams/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM money_streams WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Money stream not found' });
    return reply.code(204).send();
  });
};
