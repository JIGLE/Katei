// Shopping list — the household's shared staples list. Fast add, check off,
// clear; open items first, done items sinking below by completion time.

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { logActivity } from '../lib/activity.js';

const COLS = 'id, name, note, store, sort_order, added_by, is_done, done_at, created_at';

export const shoppingRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/shopping — open first (manual drag order), done last (most
  // recently finished first, so "just checked" sits at the divider).
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT ${COLS} FROM shopping_items
       ORDER BY is_done ASC, CASE WHEN is_done THEN NULL ELSE sort_order END ASC, done_at DESC`,
    );
    return rows;
  });

  // POST /api/shopping
  app.post<{ Body: { name: string; note?: string | null; store?: string | null } }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            note: { type: ['string', 'null'], maxLength: 500 },
            store: { type: ['string', 'null'], maxLength: 80 },
          },
        },
      },
    },
    async (req, reply) => {
      const name = req.body.name.trim();
      if (!name) return reply.code(400).send({ error: 'Name is required' });
      // New items land at the end of the current order.
      const { rows } = await query(
        `INSERT INTO shopping_items (name, note, store, added_by, sort_order)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM shopping_items))
         RETURNING ${COLS}`,
        [name, req.body.note?.trim() || null, req.body.store?.trim() || null, req.user?.id ?? null],
      );
      await logActivity(req.user?.id ?? null, 'shopping_added', name);
      return reply.code(201).send(rows[0]);
    },
  );

  // POST /api/shopping/reorder — persist a new relative order for a set of
  // items (a single store group's ids, front to back, from a drag gesture).
  app.post<{ Body: { ids: number[] } }>(
    '/reorder',
    {
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          properties: { ids: { type: 'array', items: { type: 'integer' }, minItems: 1 } },
        },
      },
    },
    async (req) => {
      const { ids } = req.body;
      for (let i = 0; i < ids.length; i++) {
        await query(`UPDATE shopping_items SET sort_order = $1 WHERE id = $2`, [i, ids[i]]);
      }
      return { ok: true, updated: ids.length };
    },
  );

  // PATCH /api/shopping/:id — rename, note, store, or (un)check.
  app.patch<{ Params: { id: string }; Body: { name?: string; note?: string | null; store?: string | null; is_done?: boolean } }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            note: { type: ['string', 'null'], maxLength: 500 },
            store: { type: ['string', 'null'], maxLength: 80 },
            is_done: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      if (req.body.name !== undefined) { fields.push(`name = $${i++}`); values.push(req.body.name.trim()); }
      if (req.body.note !== undefined) { fields.push(`note = $${i++}`); values.push(req.body.note?.trim() || null); }
      if (req.body.store !== undefined) { fields.push(`store = $${i++}`); values.push(req.body.store?.trim() || null); }
      if (req.body.is_done !== undefined) {
        fields.push(`is_done = $${i++}`); values.push(req.body.is_done);
        fields.push(`done_at = ${req.body.is_done ? 'CURRENT_TIMESTAMP' : 'NULL'}`);
      }
      if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
      values.push(req.params.id);
      const { rows } = await query(
        `UPDATE shopping_items SET ${fields.join(', ')} WHERE id = $${i} RETURNING ${COLS}`,
        values,
      );
      if (!rows.length) return reply.code(404).send({ error: 'Item not found' });
      return rows[0];
    },
  );

  // DELETE /api/shopping/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const { rowCount } = await query(`DELETE FROM shopping_items WHERE id = $1`, [req.params.id]);
    if (!rowCount) return reply.code(404).send({ error: 'Item not found' });
    return reply.code(204).send();
  });

  // POST /api/shopping/clear-done — sweep the checked-off items.
  app.post('/clear-done', async () => {
    const { rowCount } = await query(`DELETE FROM shopping_items WHERE is_done = TRUE`);
    return { cleared: rowCount ?? 0 };
  });
};
