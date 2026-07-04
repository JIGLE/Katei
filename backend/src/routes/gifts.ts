// Gift list — ideas and purchases per household member (or pet). The core
// contract: a gift is invisible to its recipient on every verb, so surprises
// survive shared devices and shared accounts. Deliberately, gift changes are
// NOT written to the activity feed — the Overview pulse is visible to the
// recipient and would spoil exactly what the hiding protects.

import type { FastifyPluginAsync } from 'fastify';
import { query, getSetting } from '../db.js';

const COLS =
  'g.id, g.recipient_id, g.title, g.url, g.link_title, g.link_site, g.price, g.currency, ' +
  'g.status, g.added_by, g.created_at, u.name AS recipient_name, u.avatar_url AS recipient_avatar, u.kind AS recipient_kind';

export const giftsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/gifts → { items, hidden_for_you }. Items exclude the caller's
  // own gifts; the count tells them the list isn't secretly empty.
  app.get('/', async (req) => {
    const uid = req.user?.id ?? 0;
    const { rows: items } = await query(
      `SELECT ${COLS} FROM gift_items g
       JOIN users u ON u.id = g.recipient_id
       WHERE g.recipient_id <> $1
       ORDER BY u.name ASC, g.status ASC, g.id ASC`,
      [uid],
    );
    const { rows: hidden } = await query<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM gift_items WHERE recipient_id = $1`,
      [uid],
    );
    return { items, hidden_for_you: Number(hidden[0]?.n ?? 0) };
  });

  // POST /api/gifts
  app.post<{
    Body: {
      recipient_id: number;
      title: string;
      url?: string | null;
      link_title?: string | null;
      link_site?: string | null;
      price?: number | null;
      currency?: string;
      status?: string;
    };
  }>(
    '/',
    {
      schema: {
        body: {
          type: 'object',
          required: ['recipient_id', 'title'],
          properties: {
            recipient_id: { type: 'integer' },
            title: { type: 'string', minLength: 1, maxLength: 160 },
            url: { type: ['string', 'null'], maxLength: 2000 },
            link_title: { type: ['string', 'null'], maxLength: 300 },
            link_site: { type: ['string', 'null'], maxLength: 120 },
            price: { type: ['number', 'null'], minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            status: { type: 'string', enum: ['idea', 'bought'] },
          },
        },
      },
    },
    async (req, reply) => {
      const currency = (req.body.currency ?? (await getSetting('default_currency')) ?? 'EUR').toUpperCase();
      const { rows } = await query(
        `INSERT INTO gift_items (recipient_id, title, url, link_title, link_site, price, currency, status, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [
          req.body.recipient_id, req.body.title.trim(), req.body.url ?? null,
          req.body.link_title ?? null, req.body.link_site ?? null,
          req.body.price ?? null, currency, req.body.status ?? 'idea', req.user?.id ?? null,
        ],
      );
      const { rows: full } = await query(
        `SELECT ${COLS} FROM gift_items g JOIN users u ON u.id = g.recipient_id WHERE g.id = $1`,
        [rows[0].id],
      );
      return reply.code(201).send(full[0]);
    },
  );

  // The recipient must not learn a gift exists even by probing ids — the
  // guard returns the same 404 an unknown id would.
  const visibleTo = async (id: string, uid: number) => {
    const { rows } = await query<{ recipient_id: number }>(
      `SELECT recipient_id FROM gift_items WHERE id = $1`,
      [id],
    );
    if (!rows.length || rows[0].recipient_id === uid) return false;
    return true;
  };

  // PATCH /api/gifts/:id — edit or mark bought.
  app.patch<{
    Params: { id: string };
    Body: {
      recipient_id?: number; title?: string; url?: string | null; link_title?: string | null;
      link_site?: string | null; price?: number | null; currency?: string; status?: string;
    };
  }>(
    '/:id',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            recipient_id: { type: 'integer' },
            title: { type: 'string', minLength: 1, maxLength: 160 },
            url: { type: ['string', 'null'], maxLength: 2000 },
            link_title: { type: ['string', 'null'], maxLength: 300 },
            link_site: { type: ['string', 'null'], maxLength: 120 },
            price: { type: ['number', 'null'], minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            status: { type: 'string', enum: ['idea', 'bought'] },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await visibleTo(req.params.id, req.user?.id ?? 0))) {
        return reply.code(404).send({ error: 'Gift not found' });
      }
      const allowed = ['recipient_id', 'title', 'url', 'link_title', 'link_site', 'price', 'currency', 'status'] as const;
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(key === 'currency' ? String(req.body[key]).toUpperCase() : req.body[key]);
        }
      }
      if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
      values.push(req.params.id);
      await query(`UPDATE gift_items SET ${fields.join(', ')} WHERE id = $${i}`, values);
      const { rows } = await query(
        `SELECT ${COLS} FROM gift_items g JOIN users u ON u.id = g.recipient_id WHERE g.id = $1`,
        [req.params.id],
      );
      return rows[0];
    },
  );

  // DELETE /api/gifts/:id
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    if (!(await visibleTo(req.params.id, req.user?.id ?? 0))) {
      return reply.code(404).send({ error: 'Gift not found' });
    }
    await query(`DELETE FROM gift_items WHERE id = $1`, [req.params.id]);
    return reply.code(204).send();
  });
};
