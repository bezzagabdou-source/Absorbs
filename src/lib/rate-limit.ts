/**
 * Tiny in-memory fixed-window rate limiter.
 * Per server instance only (serverless instances don't share memory), so it is a
 * burst guard, not a hard global limit. Daily quotas live in the database.
 */
type Bucket = { count: number; resetAt: number };

const globalForRl = globalThis as typeof globalThis & {
  __barqRl?: Map<string, Bucket>;
};
const buckets = globalForRl.__barqRl ?? (globalForRl.__barqRl = new Map());

export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    if (buckets.size > 5000) buckets.clear();
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  b.count += 1;
  if (b.count > max) {
    return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}
