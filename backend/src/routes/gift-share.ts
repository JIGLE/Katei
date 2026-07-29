// Public gift-list share link. A visitor with the link (no Katei account,
// no session) can view one list and mark items — without the list's owner
// ever finding out, exactly as a trusted household member could. Mounted
// OUTSIDE the authenticated group, same posture as calendar.ts: token-gated,
// only failed lookups count against the rate limit so a visitor revisiting
// their saved link is never throttled.

import type { FastifyPluginAsync } from 'fastify';
import { query } from '../db.js';
import { hit } from '../lib/ratelimit.js';
import { ITEM_SELECT, ITEM_FROM, ITEM_ORDER, shapeGiftItem, type RawGiftItemRow } from '../lib/giftlists.js';

interface SharedListRow {
  id: number;
  owner_name: string | null;
  external_name: string | null;
}

async function resolveToken(token: string, ip: string): Promise<{ list: SharedListRow | null; limited: boolean; retryAfterSec: number }> {
  const { rows } = await query<SharedListRow>(
    `SELECT gl.id, u.name AS owner_name, gl.external_name
       FROM gift_lists gl
       LEFT JOIN users u ON u.id = gl.owner_user_id
      WHERE gl.share_token = $1`,
    [token],
  );
  if (rows.length) return { list: rows[0], limited: false, retryAfterSec: 0 };
  const gate = hit(`giftshare:${ip}`, 30);
  return { list: null, limited: !gate.ok, retryAfterSec: gate.retryAfterSec };
}

export const giftShareRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/gift-share/:token — the list in its true (non-owner) shape.
  app.get<{ Params: { token: string } }>('/:token', async (req, reply) => {
    const { list, limited, retryAfterSec } = await resolveToken(req.params.token, req.ip);
    if (!list) {
      if (limited) {
        reply.header('Retry-After', String(retryAfterSec));
        return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
      }
      return reply.code(404).send({ error: 'List not found' });
    }
    const { rows: items } = await query<RawGiftItemRow>(
      `SELECT ${ITEM_SELECT} ${ITEM_FROM} WHERE gi.list_id = $1 ${ITEM_ORDER}`,
      [list.id],
    );
    return {
      list_name: list.owner_name ?? list.external_name,
      items: items.map((it) => shapeGiftItem(it, false)),
    };
  });

  // PATCH /api/gift-share/:token/items/:itemId — status only. No content
  // edits, no add, no delete: the minimal-trust surface for an anonymous
  // visitor, matching calendar.ts's read-only public posture as closely as
  // the feature allows.
  app.patch<{
    Params: { token: string; itemId: string };
    Body: { status: 'idea' | 'reserved' | 'bought'; bought_by_note?: string | null };
  }>(
    '/:token/items/:itemId',
    {
      schema: {
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['idea', 'reserved', 'bought'] },
            bought_by_note: { type: ['string', 'null'], maxLength: 60 },
          },
        },
      },
    },
    async (req, reply) => {
      const { list, limited, retryAfterSec } = await resolveToken(req.params.token, req.ip);
      if (!list) {
        if (limited) {
          reply.header('Retry-After', String(retryAfterSec));
          return reply.code(429).send({ error: 'Too many attempts. Try again later.' });
        }
        return reply.code(404).send({ error: 'List not found' });
      }
      const { rows: itemRows } = await query<{ id: number }>(
        `SELECT id FROM gift_items WHERE id = $1 AND list_id = $2`,
        [req.params.itemId, list.id],
      );
      if (!itemRows.length) return reply.code(404).send({ error: 'Item not found' });
      const note = req.body.bought_by_note?.trim().slice(0, 60) || null;
      if (req.body.status === 'idea') {
        await query(
          `UPDATE gift_items SET status = 'idea', bought_by_user_id = NULL, bought_by_note = NULL WHERE id = $1`,
          [req.params.itemId],
        );
      } else {
        await query(
          `UPDATE gift_items SET status = $1, bought_by_user_id = NULL, bought_by_note = $2 WHERE id = $3`,
          [req.body.status, note, req.params.itemId],
        );
      }
      const { rows } = await query<RawGiftItemRow>(
        `SELECT ${ITEM_SELECT} ${ITEM_FROM} WHERE gi.id = $1`,
        [req.params.itemId],
      );
      return shapeGiftItem(rows[0], false);
    },
  );
};
