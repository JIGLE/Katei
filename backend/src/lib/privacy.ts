// Visibility rule for private money streams: a stream marked private is
// visible only to its owner — omitted entirely everywhere else, never masked.
// One rule, reused by every route that can reach a stream directly or through
// an event/assignment, so "fully invisible" means the same thing everywhere.

import { query } from '../db.js';

export interface StreamPrivacy {
  id: number;
  private: boolean;
  owner_user_id: number | null;
}

/** True when a stream (already fetched) is visible to `viewerId`. */
export function streamVisible(
  s: Pick<StreamPrivacy, 'private' | 'owner_user_id'>,
  viewerId: number,
): boolean {
  return !s.private || s.owner_user_id === viewerId;
}

/**
 * Fetch a stream's privacy fields for a write-side reference check (an event
 * or assignment naming a money_stream_id). Returns null when the stream
 * doesn't exist OR exists but is private and not owned by viewerId — the two
 * are indistinguishable on purpose, so a reference can't be used to probe for
 * the existence of a stream you can't see.
 */
export async function visibleStreamOrNull(
  streamId: number | string,
  viewerId: number,
): Promise<StreamPrivacy | null> {
  const { rows } = await query<StreamPrivacy>(
    `SELECT id, private, owner_user_id FROM money_streams WHERE id = $1`,
    [streamId],
  );
  const row = rows[0];
  return row && streamVisible(row, viewerId) ? row : null;
}

/**
 * Same idea for an event: visible unless linked to a money stream that is
 * private and not owned by viewerId. Mirrors events.ts's own SELECT filter so
 * a write path (e.g. assignments referencing an event_id) can't reference
 * something GET would 404 on.
 */
export async function visibleEventOrNull(
  eventId: number | string,
  viewerId: number,
): Promise<{ id: number } | null> {
  const { rows } = await query<{ id: number }>(
    `SELECT he.id FROM household_events he
       LEFT JOIN money_streams s ON s.id = he.money_stream_id
      WHERE he.id = $1 AND (s.id IS NULL OR s.private = FALSE OR s.owner_user_id = $2)`,
    [eventId, viewerId],
  );
  return rows[0] ?? null;
}
