// A tiny in-memory fixed-window rate limiter. Enough for a single-instance,
// self-hosted app to blunt password brute-forcing without adding Redis. State
// is per-process; it resets on restart, which is acceptable here.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Record an attempt for `key`. Returns ok:false once more than `limit`
 * attempts happen within `windowMs`. Call `clear(key)` on success so a
 * legitimate login doesn't count against the user.
 */
export function hit(key: string, limit = 8, windowMs = 15 * 60 * 1000): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now >= b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

export function clear(key: string): void {
  buckets.delete(key);
}

/** Test helper — wipe all state. */
export function _reset(): void {
  buckets.clear();
}
