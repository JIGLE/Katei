import type { AssignmentDetail } from './types';

/**
 * The set of event or money-stream ids assigned to one member — the shared
 * backbone of every "Assigned to me" filter (Timeline, Money, Overview).
 * Filtering stays client-side over already-fetched assignments; the backend's
 * `/assignments?user_id=` param is the scale path if lists ever outgrow this.
 */
export function assignedIds(
  assignments: AssignmentDetail[],
  userId: number | undefined,
  key: 'event_id' | 'money_stream_id',
): Set<number> {
  const ids = new Set<number>();
  if (userId == null) return ids;
  for (const a of assignments) {
    const value = a[key];
    if (a.user_id === userId && value != null) ids.add(value);
  }
  return ids;
}
