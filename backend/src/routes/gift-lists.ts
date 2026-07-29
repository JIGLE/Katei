// Gift lists — one wishlist per household member (lazily created on first
// access) or per external person (a friend/relative who isn't a Katei user).
// The masking contract: a list's own owner always sees their items as
// untouched ideas with no attribution, regardless of the true status —
// everyone else sees the truth. See lib/giftlists.ts for the shaping rule.
// Deliberately, no gift change is written to the activity feed — the
// Overview pulse is visible to the owner and would spoil exactly what the
// masking protects.

import { randomBytes } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { query, getSetting } from '../db.js';
import { isAdmin } from '../lib/authz.js';
import {
  ITEM_SELECT, ITEM_FROM, ITEM_ORDER, shapeGiftItem, findList,
  type RawGiftItemRow, type GiftListRow,
} from '../lib/giftlists.js';

interface ListSummaryRow {
  id: number;
  owner_user_id: number | null;
  external_name: string | null;
  share_token: string | null;
  owner_name: string | null;
  owner_avatar: string | null;
  owner_kind: string | null;
}

async function canManageShare(list: GiftListRow, uid: number): Promise<boolean> {
  if (list.owner_user_id === uid) return true;
  if (list.owner_user_id === null) return true; // external lists: any member manages
  return isAdmin(uid);
}

export const giftListsRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/gift-lists → { mine, others }. Lazily creates the caller's own
  // list — a member never explicitly "creates" their wishlist. Pets can
  // never log in to trigger that for themselves, so this also backfills a
  // list for any pet still missing one — the only "special-casing" pets
  // get, and it's just eager creation, not a different code path.
  app.get('/', async (req) => {
    const uid = req.user.id;
    await query(
      `INSERT INTO gift_lists (owner_user_id, created_by)
       SELECT id, $1 FROM users WHERE id = $1 OR kind = 'pet'
       ON CONFLICT (owner_user_id) WHERE owner_user_id IS NOT NULL DO NOTHING`,
      [uid],
    );
    const { rows: lists } = await query<ListSummaryRow>(
      `SELECT gl.id, gl.owner_user_id, gl.external_name, gl.share_token,
              u.name AS owner_name, u.avatar_url AS owner_avatar, u.kind AS owner_kind
         FROM gift_lists gl
         LEFT JOIN users u ON u.id = gl.owner_user_id
        ORDER BY COALESCE(u.name, gl.external_name) ASC`,
    );
    const { rows: items } = await query<RawGiftItemRow>(
      `SELECT ${ITEM_SELECT} ${ITEM_FROM} ${ITEM_ORDER}`,
    );
    const itemsByList = new Map<number, RawGiftItemRow[]>();
    for (const it of items) {
      itemsByList.set(it.list_id, [...(itemsByList.get(it.list_id) ?? []), it]);
    }
    const shapeList = (l: ListSummaryRow) => {
      const isOwner = l.owner_user_id === uid;
      return {
        id: l.id,
        owner_user_id: l.owner_user_id,
        owner_name: l.owner_name,
        owner_avatar: l.owner_avatar,
        owner_kind: l.owner_kind,
        external_name: l.external_name,
        is_mine: isOwner,
        share_enabled: !!l.share_token,
        items: (itemsByList.get(l.id) ?? []).map((it) => shapeGiftItem(it, isOwner)),
      };
    };
    const mine = lists.find((l) => l.owner_user_id === uid);
    return {
      mine: mine ? shapeList(mine) : null,
      others: lists.filter((l) => l.owner_user_id !== uid).map(shapeList),
    };
  });

  // POST /api/gift-lists — a list for someone who isn't a Katei user.
  app.post<{ Body: { external_name: string } }>(
    '/',
    { schema: { body: { type: 'object', required: ['external_name'], properties: {
      external_name: { type: 'string', minLength: 1, maxLength: 120 },
    } } } },
    async (req, reply) => {
      const name = req.body.external_name.trim();
      if (!name) return reply.code(400).send({ error: 'Name is required' });
      const { rows } = await query<{ id: number }>(
        `INSERT INTO gift_lists (external_name, created_by) VALUES ($1, $2) RETURNING id`,
        [name, req.user.id],
      );
      return reply.code(201).send({
        id: rows[0].id, owner_user_id: null, owner_name: null, owner_avatar: null,
        owner_kind: null, external_name: name, is_mine: false, share_enabled: false, items: [],
      });
    },
  );

  // PATCH /api/gift-lists/:id — rename an external list only; a member's
  // list takes its name from `users.name`, so renaming it makes no sense.
  app.patch<{ Params: { id: string }; Body: { external_name: string } }>(
    '/:id',
    { schema: { body: { type: 'object', required: ['external_name'], properties: {
      external_name: { type: 'string', minLength: 1, maxLength: 120 },
    } } } },
    async (req, reply) => {
      const list = await findList(req.params.id);
      if (!list) return reply.code(404).send({ error: 'List not found' });
      if (list.owner_user_id !== null) return reply.code(400).send({ error: "Can't rename a member's list" });
      const name = req.body.external_name.trim();
      if (!name) return reply.code(400).send({ error: 'Name is required' });
      await query(`UPDATE gift_lists SET external_name = $1 WHERE id = $2`, [name, req.params.id]);
      return { id: list.id, external_name: name };
    },
  );

  // DELETE /api/gift-lists/:id — external lists only; a member's list lives
  // as long as they're a member and is cleaned up via ON DELETE CASCADE.
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const list = await findList(req.params.id);
    if (!list) return reply.code(404).send({ error: 'List not found' });
    if (list.owner_user_id !== null) return reply.code(400).send({ error: "Can't delete a member's list" });
    await query(`DELETE FROM gift_lists WHERE id = $1`, [req.params.id]);
    return reply.code(204).send();
  });

  // Share link — opt-in and revocable, unlike the always-on household
  // calendar feed, because this exposes one person's private list rather
  // than shared household data. Same 404 whether the id is unknown or the
  // caller lacks permission — no oracle for "does this person have sharing on".
  app.get<{ Params: { id: string } }>('/:id/share', async (req, reply) => {
    const list = await findList(req.params.id);
    if (!list || !(await canManageShare(list, req.user.id))) {
      return reply.code(404).send({ error: 'List not found' });
    }
    return { share_token: list.share_token };
  });

  app.post<{ Params: { id: string } }>('/:id/share', async (req, reply) => {
    const list = await findList(req.params.id);
    if (!list || !(await canManageShare(list, req.user.id))) {
      return reply.code(404).send({ error: 'List not found' });
    }
    const token = randomBytes(24).toString('base64url');
    await query(`UPDATE gift_lists SET share_token = $1 WHERE id = $2`, [token, req.params.id]);
    return { share_token: token };
  });

  app.delete<{ Params: { id: string } }>('/:id/share', async (req, reply) => {
    const list = await findList(req.params.id);
    if (!list || !(await canManageShare(list, req.user.id))) {
      return reply.code(404).send({ error: 'List not found' });
    }
    await query(`UPDATE gift_lists SET share_token = NULL WHERE id = $1`, [req.params.id]);
    return { share_token: null };
  });

  // POST /api/gift-lists/:id/items — any household member may add to any
  // list, including their own (adding to your own wishlist is normal).
  app.post<{
    Params: { id: string };
    Body: {
      title: string; url?: string | null; link_title?: string | null;
      link_site?: string | null; price?: number | null; currency?: string;
    };
  }>(
    '/:id/items',
    {
      schema: {
        body: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 160 },
            url: { type: ['string', 'null'], maxLength: 2000 },
            link_title: { type: ['string', 'null'], maxLength: 300 },
            link_site: { type: ['string', 'null'], maxLength: 120 },
            price: { type: ['number', 'null'], minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
          },
        },
      },
    },
    async (req, reply) => {
      const list = await findList(req.params.id);
      if (!list) return reply.code(404).send({ error: 'List not found' });
      const currency = (req.body.currency ?? (await getSetting('default_currency')) ?? 'EUR').toUpperCase();
      const { rows } = await query<{ id: number }>(
        `INSERT INTO gift_items (list_id, title, url, link_title, link_site, price, currency, added_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          req.params.id, req.body.title.trim(), req.body.url ?? null,
          req.body.link_title ?? null, req.body.link_site ?? null,
          req.body.price ?? null, currency, req.user.id,
        ],
      );
      const { rows: full } = await query<RawGiftItemRow>(
        `SELECT ${ITEM_SELECT} ${ITEM_FROM} WHERE gi.id = $1`,
        [rows[0].id],
      );
      return reply.code(201).send(shapeGiftItem(full[0], list.owner_user_id === req.user.id));
    },
  );

  // PATCH /api/gift-lists/items/:itemId — edit content, or mark status. The
  // owner may edit content on their own items but a status change on their
  // own list is rejected outright (never silently dropped), so nothing that
  // looks like success actually lets an owner learn their own gift's fate.
  app.patch<{
    Params: { itemId: string };
    Body: {
      title?: string; url?: string | null; link_title?: string | null; link_site?: string | null;
      price?: number | null; currency?: string; status?: 'idea' | 'reserved' | 'bought';
    };
  }>(
    '/items/:itemId',
    {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 160 },
            url: { type: ['string', 'null'], maxLength: 2000 },
            link_title: { type: ['string', 'null'], maxLength: 300 },
            link_site: { type: ['string', 'null'], maxLength: 120 },
            price: { type: ['number', 'null'], minimum: 0 },
            currency: { type: 'string', minLength: 3, maxLength: 3 },
            status: { type: 'string', enum: ['idea', 'reserved', 'bought'] },
          },
        },
      },
    },
    async (req, reply) => {
      const { rows: itemRows } = await query<{ list_id: number }>(
        `SELECT list_id FROM gift_items WHERE id = $1`,
        [req.params.itemId],
      );
      if (!itemRows.length) return reply.code(404).send({ error: 'Item not found' });
      const list = await findList(itemRows[0].list_id);
      const isOwner = list?.owner_user_id === req.user.id;
      if (isOwner && req.body.status !== undefined) {
        return reply.code(403).send({ error: 'You cannot mark your own gift.' });
      }
      const fields: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      const contentFields = ['title', 'url', 'link_title', 'link_site', 'price', 'currency'] as const;
      for (const key of contentFields) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = $${i++}`);
          values.push(key === 'currency' && req.body[key] != null ? String(req.body[key]).toUpperCase() : req.body[key]);
        }
      }
      if (req.body.status !== undefined) {
        fields.push(`status = $${i++}`);
        values.push(req.body.status);
        if (req.body.status === 'idea') {
          fields.push(`bought_by_user_id = NULL`);
          fields.push(`bought_by_note = NULL`);
        } else {
          fields.push(`bought_by_user_id = $${i++}`);
          values.push(req.user.id);
          fields.push(`bought_by_note = NULL`);
        }
      }
      if (!fields.length) return reply.code(400).send({ error: 'Nothing to update' });
      values.push(req.params.itemId);
      await query(`UPDATE gift_items SET ${fields.join(', ')} WHERE id = $${i}`, values);
      const { rows } = await query<RawGiftItemRow>(
        `SELECT ${ITEM_SELECT} ${ITEM_FROM} WHERE gi.id = $1`,
        [req.params.itemId],
      );
      return shapeGiftItem(rows[0], isOwner);
    },
  );

  // DELETE /api/gift-lists/items/:itemId
  app.delete<{ Params: { itemId: string } }>('/items/:itemId', async (req, reply) => {
    const { rowCount } = await query(`DELETE FROM gift_items WHERE id = $1`, [req.params.itemId]);
    if (!rowCount) return reply.code(404).send({ error: 'Item not found' });
    return reply.code(204).send();
  });
};
