import type { FastifyPluginAsync } from 'fastify';
import { query, getSetting } from '../db.js';
import { logActivity } from '../lib/activity.js';

const COLS =
  'id, name, amount, currency, is_recurring, frequency, category, stream_type, due_day, due_shift, automated, private, owner_user_id, created_at';

export const moneyStreamsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/money-streams — a private stream is omitted entirely unless the
  // caller owns it: never masked, never counted for anyone else.
  app.get('/', async (req) => {
    const { rows } = await query(
      `SELECT ${COLS} FROM money_streams WHERE private = FALSE OR owner_user_id = $1 ORDER BY created_at DESC`,
      [req.user.id],
    );
    return rows;
  });

  // GET /api/money-streams/:id
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rows } = await query(
      `SELECT ${COLS} FROM money_streams WHERE id = $1 AND (private = FALSE OR owner_user_id = $2)`,
      [req.params.id, req.user.id],
    );
    // Same 404 whether the id is unknown or it's a private stream someone
    // else owns — an oracle-free response either way.
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
      automated?: boolean;
      private?: boolean;
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
            automated: { type: 'boolean' },
            private: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const {
        name,
        amount,
        // Omitted currency means the household's own, never a hard-coded one —
        // a USD default silently mislabels every aggregate for non-USD homes.
        currency = (await getSetting('default_currency')) ?? 'EUR',
        is_recurring = true,
        frequency = 'monthly',
        category = null,
        stream_type = 'expense',
        due_day = 1,
        due_shift = 'next',
        automated = false,
        private: isPrivate = false,
      } = req.body;
      const ownerUserId = isPrivate ? req.user.id : null;
      const { rows } = await query(
        `INSERT INTO money_streams (name, amount, currency, is_recurring, frequency, category, stream_type, due_day, due_shift, automated, private, owner_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING ${COLS}`,
        [name, amount, currency, is_recurring, frequency, category, stream_type, due_day, due_shift, automated, isPrivate, ownerUserId],
      );
      await logActivity(req.user?.id ?? null, 'stream_added', name, rows[0].id);
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
      automated?: boolean;
      private?: boolean;
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
            automated: { type: 'boolean' },
            private: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const current = await query<{ private: boolean; owner_user_id: number | null }>(
        `SELECT private, owner_user_id FROM money_streams WHERE id = $1`,
        [req.params.id],
      );
      if (!current.rows.length) return reply.code(404).send({ error: 'Money stream not found' });
      const { private: wasPrivate, owner_user_id: currentOwner } = current.rows[0];
      // A stream that's already private is off-limits to anyone but its owner —
      // the whole request 404s, not just the privacy fields, so a non-owner
      // can't even learn that some other field is editable here.
      if (wasPrivate && currentOwner !== req.user.id) {
        return reply.code(404).send({ error: 'Money stream not found' });
      }

      const allowed = ['name', 'amount', 'currency', 'is_recurring', 'frequency', 'category', 'stream_type', 'due_day', 'due_shift', 'automated'] as const;
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(req.body[key]);
        }
      }
      // private/owner_user_id move together: claiming privacy on an unowned
      // stream assigns the caller as owner; un-privating clears ownership.
      if (req.body.private !== undefined) {
        const nextOwner = req.body.private ? (currentOwner ?? req.user.id) : null;
        fields.push(`private = $${i++}`);
        values.push(req.body.private);
        fields.push(`owner_user_id = $${i++}`);
        values.push(nextOwner);
      }
      if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE money_streams SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${COLS}`,
        values,
      );
      if (!rows.length) return reply.code(404).send({ error: 'Money stream not found' });

      // Switching a stream to automated retires its pending obligations so it
      // disappears from "needs attention" and reminders immediately.
      if (req.body.automated === true) {
        await query(
          `DELETE FROM household_events
            WHERE money_stream_id = $1 AND is_completed = FALSE
              AND target_date >= CURRENT_DATE AND event_type IN ('payment', 'income')`,
          [req.params.id],
        );
      }
      return rows[0];
    },
  );

  // DELETE /api/money-streams/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const current = await query<{ private: boolean; owner_user_id: number | null }>(
      `SELECT private, owner_user_id FROM money_streams WHERE id = $1`,
      [req.params.id],
    );
    if (!current.rows.length) return reply.code(404).send({ error: 'Money stream not found' });
    const { private: wasPrivate, owner_user_id: currentOwner } = current.rows[0];
    if (wasPrivate && currentOwner !== req.user.id) {
      return reply.code(404).send({ error: 'Money stream not found' });
    }
    if (wasPrivate) {
      // household_events.money_stream_id is ON DELETE SET NULL — left as-is,
      // deleting the stream first would un-link its events and make their
      // (already denormalized) titles visible to the whole household. Delete
      // the events first so that leaky state is never reachable, even if the
      // process dies between the two statements.
      await query('DELETE FROM household_events WHERE money_stream_id = $1', [req.params.id]);
    }
    const { rowCount } = await query('DELETE FROM money_streams WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Money stream not found' });
    return reply.code(204).send();
  });
};
