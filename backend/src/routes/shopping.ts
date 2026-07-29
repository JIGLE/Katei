// Shopping list — the household's shared staples list. Fast add, check off,
// clear; open items first, done items sinking below by completion time.

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { logActivity } from '../lib/activity.js';

const COLS = 'id, name, note, store, added_by, is_done, done_at, created_at';

export const shoppingRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/shopping — open first (oldest added first), done last (most
  // recently finished first, so "just checked" sits at the divider).
  app.get('/', async () => {
    const { rows } = await query(
      `SELECT ${COLS} FROM shopping_items
       ORDER BY is_done ASC, CASE WHEN is_done THEN NULL ELSE id END ASC, done_at DESC`,
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
      const { rows } = await query(
        `INSERT INTO shopping_items (name, note, store, added_by) VALUES ($1, $2, $3, $4) RETURNING ${COLS}`,
        [name, req.body.note?.trim() || null, req.body.store?.trim() || null, req.user?.id ?? null],
      );
      await logActivity(req.user?.id ?? null, 'shopping_added', name);
      return reply.code(201).send(rows[0]);
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
