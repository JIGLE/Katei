// Shared gift-list item shaping. The masking rule lives in exactly one place
// so the authenticated router and the public share-link router can never
// drift apart on what a list's own owner is allowed to see: everyone reads
// the truth about a list except the person it belongs to, who always sees
// their own items as untouched ideas with no attribution, so surprises
// survive shared devices and shared accounts.

import { query } from '../db.js';

export const ITEM_SELECT =
  'gi.id, gi.list_id, gi.title, gi.url, gi.link_title, gi.link_site, gi.price, gi.currency, gi.status, ' +
  'ab.name AS added_by_name, bb.name AS bought_by_user_name, gi.bought_by_note, gi.created_at';

export const ITEM_FROM =
  `FROM gift_items gi
   LEFT JOIN users ab ON ab.id = gi.added_by
   LEFT JOIN users bb ON bb.id = gi.bought_by_user_id`;

// Ideas (still an opportunity to give) surface above claimed/bought items.
export const ITEM_ORDER =
  `ORDER BY CASE gi.status WHEN 'idea' THEN 0 WHEN 'reserved' THEN 1 ELSE 2 END, gi.id ASC`;

export interface RawGiftItemRow {
  id: number;
  list_id: number;
  title: string;
  url: string | null;
  link_title: string | null;
  link_site: string | null;
  price: string | null;
  currency: string | null;
  status: string;
  added_by_name: string | null;
  bought_by_user_name: string | null;
  bought_by_note: string | null;
  created_at: string;
}

export interface ShapedGiftItem {
  id: number;
  list_id: number;
  title: string;
  url: string | null;
  link_title: string | null;
  link_site: string | null;
  price: string | null;
  currency: string | null;
  status: 'idea' | 'reserved' | 'bought';
  added_by_name: string | null;
  bought_by_name: string | null;
  created_at: string;
}

/**
 * The one masking rule. `isOwner` means the viewer owns the list the item
 * belongs to — apply it after a SELECT that always fetched the true row;
 * never vary the SQL column list itself (that stays the existing
 * SQL-injection-defense allowlist).
 */
export function shapeGiftItem(row: RawGiftItemRow, isOwner: boolean): ShapedGiftItem {
  const base = {
    id: row.id,
    list_id: row.list_id,
    title: row.title,
    url: row.url,
    link_title: row.link_title,
    link_site: row.link_site,
    price: row.price,
    currency: row.currency,
    created_at: row.created_at,
  };
  if (isOwner) {
    return { ...base, status: 'idea', added_by_name: null, bought_by_name: null };
  }
  return {
    ...base,
    status: row.status as ShapedGiftItem['status'],
    added_by_name: row.added_by_name,
    bought_by_name: row.bought_by_user_name ?? row.bought_by_note ?? null,
  };
}

export interface GiftListRow {
  id: number;
  owner_user_id: number | null;
  share_token: string | null;
}

export async function findList(listId: number | string): Promise<GiftListRow | null> {
  const { rows } = await query<GiftListRow>(
    `SELECT id, owner_user_id, share_token FROM gift_lists WHERE id = $1`,
    [listId],
  );
  return rows[0] ?? null;
}
