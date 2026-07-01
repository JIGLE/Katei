// Savings ledger — the household's accumulated set-aside money.
//
// The balance is an opening amount (recorded once, e.g. "what we already have")
// plus every contribution in savings_entries: one-time deposits made here, and
// confirmed recurring savings posted from completed events. This is deliberately
// an accumulated balance, not a monthly rate — "add €500" should move the number.

import type { FastifyPluginAsync } from 'fastify';
import { query, getSetting } from '../db.js';
import { logActivity } from '../lib/activity.js';

const ENTRY_COLS = 'id, amount, note, occurred_on, money_stream_id, created_at';

async function summary() {
  const opening = Number((await getSetting('savings_opening')) ?? 0);
  const { rows: entries } = await query(
    `SELECT ${ENTRY_COLS} FROM savings_entries ORDER BY occurred_on DESC, id DESC`,
  );
  const contributed = entries.reduce((sum, e) => sum + Number(e.amount), 0);
  return { opening, contributed, balance: opening + contributed, entries };
}

export const savingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/savings — opening + contributions + running balance + the ledger.
  app.get('/', async () => summary());

  // POST /api/savings/entries — record a contribution (or a negative withdrawal).
  app.post<{ Body: { amount: number; note?: string; occurred_on?: string } }>(
    '/entries',
    {
      schema: {
        body: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: { type: 'number' },
            note: { type: 'string', maxLength: 120 },
            occurred_on: { type: 'string', format: 'date' },
          },
        },
      },
    },
    async (req, reply) => {
      const { amount, note = null, occurred_on } = req.body;
      await query(
        `INSERT INTO savings_entries (amount, note, occurred_on)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE))`,
        [amount, note, occurred_on ?? null],
      );
      await logActivity(req.user?.id ?? null, 'savings_added', note?.trim() || String(amount));
      return reply.code(201).send(await summary());
    },
  );

  // DELETE /api/savings/entries/:id — remove a contribution.
  app.delete<{ Params: { id: string } }>('/entries/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM savings_entries WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Savings entry not found' });
    return summary();
  });
};
