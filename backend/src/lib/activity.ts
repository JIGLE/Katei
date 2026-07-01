// Household activity log — the shared "pulse" rendered on the Overview.
// Each row stores who did what to which named thing; the client turns the
// (action, summary) pair into a localized sentence, so no prose is stored.

import { query } from '../db.js';

export type ActivityAction =
  | 'stream_added'
  | 'event_added'
  | 'event_done'
  | 'payment_paid'
  | 'member_added';

/**
 * Record a household action. Logging must never break the primary request, so
 * failures are swallowed (the activity feed is a nicety, not a source of truth).
 * @param actorId the acting user, or null for system actions
 * @param action  a stable verb the client maps to a localized sentence
 * @param summary the entity's display name (e.g. the stream or member name)
 */
export async function logActivity(
  actorId: number | null,
  action: ActivityAction,
  summary: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO activity (actor_id, action, summary) VALUES ($1, $2, $3)`,
      [actorId, action, summary],
    );
  } catch {
    // Intentionally ignored — never let the feed sink the real operation.
  }
}
