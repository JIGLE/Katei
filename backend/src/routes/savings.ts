// Savings — an accumulated balance split across named pots (goals).
//
// Balance = opening amount (app_settings 'savings_opening', held by the default
// pot) + every contribution in savings_entries. Each entry may target a pot; a
// null goal_id counts toward the default pot. This is deliberately an accumulated
// balance, not a monthly rate — "add €500 to the trip" moves that pot.

import type { FastifyPluginAsync } from 'fastify';
import { query, getSetting } from '../db.js';
import { logActivity } from '../lib/activity.js';

const ENTRY_COLS = 'id, amount, note, occurred_on, money_stream_id, goal_id, created_at';
const GOAL_COLS = 'id, name, target_amount, icon, is_default, created_at';

/** The default pot's id, created on demand so the system self-heals (and tests
 *  that truncate the table still work). */
async function getOrCreateDefaultGoalId(): Promise<number> {
  const { rows } = await query<{ id: number }>(
    `SELECT id FROM savings_goals WHERE is_default = TRUE ORDER BY id LIMIT 1`,
  );
  if (rows.length) return rows[0].id;
  const target = await getSetting('savings_goal');
  const { rows: ins } = await query<{ id: number }>(
    `INSERT INTO savings_goals (name, target_amount, icon, is_default) VALUES ($1, $2, $3, TRUE) RETURNING id`,
    ['General', target && Number(target) > 0 ? Number(target) : null, '🐷'],
  );
  return ins[0].id;
}

interface EntryRow { id: number; amount: string; goal_id: number | null; [k: string]: unknown }
interface GoalRow { id: number; name: string; target_amount: string | null; icon: string | null; is_default: boolean; created_at: string }

async function summary() {
  const opening = Number((await getSetting('savings_opening')) ?? 0);
  const defaultId = await getOrCreateDefaultGoalId();
  const { rows: goals } = await query<GoalRow>(
    `SELECT ${GOAL_COLS} FROM savings_goals ORDER BY is_default DESC, created_at ASC, id ASC`,
  );
  const { rows: entries } = await query<EntryRow>(
    `SELECT ${ENTRY_COLS} FROM savings_entries ORDER BY occurred_on DESC, id DESC`,
  );
  const contributed = entries.reduce((sum, e) => sum + Number(e.amount), 0);

  const pots = goals.map((g) => {
    // Entries with no pot fall under the default one.
    const potEntries = entries.filter((e) => (e.goal_id ?? defaultId) === g.id);
    const sum = potEntries.reduce((s, e) => s + Number(e.amount), 0);
    const base = g.is_default ? opening : 0;
    return {
      id: g.id,
      name: g.name,
      target: g.target_amount != null ? Number(g.target_amount) : null,
      icon: g.icon,
      is_default: g.is_default,
      balance: base + sum,
      entries: potEntries,
    };
  });

  return { opening, contributed, balance: opening + contributed, entries, pots };
}

export const savingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/savings — opening + balance + the ledger + the pots.
  app.get('/', async () => summary());

  // POST /api/savings/entries — record a contribution (optionally to a pot).
  app.post<{ Body: { amount: number; note?: string; occurred_on?: string; goal_id?: number | null } }>(
    '/entries',
    {
      schema: {
        body: {
          type: 'object',
          required: ['amount'],
          properties: {
            amount: { type: 'number' },
            note: { type: ['string', 'null'], maxLength: 120 },
            occurred_on: { type: 'string', format: 'date' },
            goal_id: { type: ['integer', 'null'] },
          },
        },
      },
    },
    async (req, reply) => {
      const { amount, note = null, occurred_on } = req.body;
      const goalId = req.body.goal_id ?? (await getOrCreateDefaultGoalId());
      await query(
        `INSERT INTO savings_entries (amount, note, occurred_on, goal_id)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4)`,
        [amount, note, occurred_on ?? null, goalId],
      );
      await logActivity(req.user?.id ?? null, 'savings_added', note?.trim() || String(amount));
      return reply.code(201).send(await summary());
    },
  );

  // PATCH /api/savings/entries/:id — correct a mistaken contribution.
  app.patch<{ Params: { id: string }; Body: { amount?: number; note?: string; occurred_on?: string; goal_id?: number | null } }>(
    '/entries/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            note: { type: ['string', 'null'], maxLength: 120 },
            occurred_on: { type: 'string', format: 'date' },
            goal_id: { type: ['integer', 'null'] },
          },
        },
      },
    },
    async (req, reply) => {
      const allowed = ['amount', 'note', 'occurred_on', 'goal_id'] as const;
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
      const { rowCount } = await query(
        `UPDATE savings_entries SET ${fields.join(', ')} WHERE id = $${i}`,
        values,
      );
      if (!rowCount) return reply.code(404).send({ error: 'Savings entry not found' });
      return summary();
    },
  );

  // DELETE /api/savings/entries/:id — remove a contribution.
  app.delete<{ Params: { id: string } }>('/entries/:id', async (req, reply) => {
    const { rowCount } = await query('DELETE FROM savings_entries WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Savings entry not found' });
    return summary();
  });

  // --- Pots (goals) ---------------------------------------------------------

  // POST /api/savings/goals — add a pot (holiday, furniture, …).
  app.post<{ Body: { name: string; target_amount?: number | null; icon?: string | null } }>(
    '/goals',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            target_amount: { type: ['number', 'null'], minimum: 0 },
            icon: { type: ['string', 'null'], maxLength: 16 },
          },
        },
      },
    },
    async (req, reply) => {
      const { name, target_amount = null, icon = null } = req.body;
      await query(
        `INSERT INTO savings_goals (name, target_amount, icon, is_default) VALUES ($1, $2, $3, FALSE)`,
        [name.trim(), target_amount, icon],
      );
      return reply.code(201).send(await summary());
    },
  );

  // PATCH /api/savings/goals/:id — rename / retarget / re-icon a pot.
  app.patch<{ Params: { id: string }; Body: { name?: string; target_amount?: number | null; icon?: string | null } }>(
    '/goals/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 80 },
            target_amount: { type: ['number', 'null'], minimum: 0 },
            icon: { type: ['string', 'null'], maxLength: 16 },
          },
        },
      },
    },
    async (req, reply) => {
      const allowed = ['name', 'target_amount', 'icon'] as const;
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
      const { rowCount } = await query(`UPDATE savings_goals SET ${fields.join(', ')} WHERE id = $${i}`, values);
      if (!rowCount) return reply.code(404).send({ error: 'Savings goal not found' });
      return summary();
    },
  );

  // DELETE /api/savings/goals/:id — remove a pot (its entries fall back to the
  // default). The default pot cannot be deleted.
  app.delete<{ Params: { id: string } }>('/goals/:id', async (req, reply) => {
    const { rows } = await query<{ is_default: boolean }>(
      `SELECT is_default FROM savings_goals WHERE id = $1`,
      [req.params.id],
    );
    if (!rows.length) return reply.code(404).send({ error: 'Savings goal not found' });
    if (rows[0].is_default) return reply.code(400).send({ error: 'The default pot cannot be deleted.' });
    await query('DELETE FROM savings_goals WHERE id = $1', [req.params.id]);
    return summary();
  });
};
