import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { logActivity } from '../lib/activity.js';

const COLS =
  'id, title, description, event_type, target_date, is_completed, money_stream_id, actual_amount, created_at';

/**
 * Post a savings contribution to the ledger when a "set aside" event is confirmed.
 * Uses the amount actually set aside if captured, otherwise the linked stream's
 * planned amount. A missing amount records nothing (nothing meaningful to add).
 */
async function recordSavingsContribution(
  streamId: number | null,
  actualAmount: string | null,
): Promise<void> {
  let amount = actualAmount != null ? Number(actualAmount) : null;
  let note: string | null = null;
  if (streamId != null) {
    const { rows } = await query<{ name: string; amount: string }>(
      `SELECT name, amount FROM money_streams WHERE id = $1`,
      [streamId],
    );
    if (rows.length) {
      note = rows[0].name;
      if (amount == null) amount = Number(rows[0].amount);
    }
  }
  if (amount == null || Number.isNaN(amount)) return;
  await query(
    `INSERT INTO savings_entries (amount, note, money_stream_id) VALUES ($1, $2, $3)`,
    [amount, note, streamId],
  );
}

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
            description: { type: ['string', 'null'] },
            event_type: { type: 'string', enum: ['deadline', 'payment', 'appointment', 'income', 'savings'] },
            target_date: { type: 'string', format: 'date' },
            // Nullable: the form sends null for "no linked cost". Without 'null'
            // here, Fastify's type coercion turns null into 0, which then fails
            // the money_stream_id foreign key ("A linked item no longer exists").
            money_stream_id: { type: ['integer', 'null'] },
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
      await logActivity(req.user?.id ?? null, 'event_added', title);
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
      actual_amount?: number | null;
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
            event_type: { type: 'string', enum: ['deadline', 'payment', 'appointment', 'income', 'savings'] },
            target_date: { type: 'string', format: 'date' },
            is_completed: { type: 'boolean' },
            money_stream_id: { type: ['integer', 'null'] },
            actual_amount: { type: ['number', 'null'], minimum: 0 },
          },
        },
      },
    },
    async (req, reply) => {
      const allowed = [
        'title', 'description', 'event_type', 'target_date', 'is_completed', 'money_stream_id', 'actual_amount',
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
      // Read the prior state so we only act on a real false→true transition —
      // re-confirming an already-done event must not post savings twice.
      const before = await query<{ is_completed: boolean }>(
        `SELECT is_completed FROM household_events WHERE id = $1`,
        [req.params.id],
      );
      if (!before.rows.length) return reply.code(404).send({ error: 'Event not found' });
      const wasCompleted = before.rows[0].is_completed;

      const { rows } = await query<{
        title: string; event_type: string; money_stream_id: number | null; actual_amount: string | null;
      }>(
        `UPDATE household_events SET is_completed = $1 WHERE id = $2 RETURNING ${COLS}`,
        [req.body.is_completed, req.params.id],
      );
      // Only celebrate finishing something, not un-checking it. Payments read
      // differently from chores, so they get their own verb.
      if (req.body.is_completed && !wasCompleted) {
        const evt = rows[0];
        if (evt.event_type === 'savings') {
          // Confirming a recurring "set aside" posts the actual amount to the
          // savings ledger — the balance only grows when a contribution is made.
          await recordSavingsContribution(evt.money_stream_id, evt.actual_amount);
          await logActivity(req.user?.id ?? null, 'savings_added', evt.title);
        } else {
          const action = evt.event_type === 'payment' ? 'payment_paid' : 'event_done';
          await logActivity(req.user?.id ?? null, action, evt.title);
        }
      }
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
