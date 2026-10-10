/**
 * Nexus AI v15.2 — RATE LIMIT + CONCURRENCY, built for 100k users/day.
 * =============================================================================
 * The old version was a Map in one process. With N serverless instances it
 * allowed N× the intended rate, and it had no concept of concurrency at all —
 * so one tab-spamming user could hold every streaming connection on an
 * instance and starve everyone else.
 *
 * The arithmetic that drove this design (also recorded in the academy corpus):
 *   100,000 req/day = 1.16 rps mean, but ~10% lands in the busiest hour
 *   → ~3 rps sustained, ~12 rps spikes. A 30 s stream at 12 rps means
 *   ~360 concurrent open connections. Concurrency is the binding constraint,
 *   not requests per second.
 *
 * Three layers, each degrading safely:
 *   L1  in-memory sliding window   — always on, per instance, microsecond cost
 *   L2  shared store (Upstash REST) — the real global limit, when configured
 *   L3  concurrency semaphore      — caps simultaneous streams per user
 *
 * L2 is optional on purpose: a self-hosted single-instance build is correct
 * with L1 alone, and a missing Redis must never take the app down.
 */

/* ------------------------------------------------------------------ types */

export interface RateResult {
  ok: boolean;
  /** Seconds the client should wait. 0 when allowed. */
  retryAfter: number;
  /** Requests left in the current window (best effort). */
  remaining: number;
  /** Which layer made the decision — useful in logs. */
  via: "memory" | "shared" | "concurrency";
}

/* ------------------------------------------------- L1: sliding window (mem) */

/**
 * A sliding window beats a fixed window: a fixed window lets a client send
 * `max` at 00:59 and `max` again at 01:00, i.e. 2× the limit instantaneously.
 * We keep timestamps and drop the ones that aged out.
 */
type Window = { hits: number[] };

const g = globalThis as typeof globalThis & {
  __nxRl?: Map<string, Window>;
  __nxConc?: Map<string, number>;
  __nxSweep?: number;
};

const windows = g.__nxRl ?? (g.__nxRl = new Map<string, Window>());
const running = g.__nxConc ?? (g.__nxConc = new Map<string, number>());

/** Bounded memory: never let an attack grow the map without limit. */
const MAX_KEYS = 20_000;

function sweep(now: number): void {
  if (g.__nxSweep && now - g.__nxSweep < 30_000) return;
  g.__nxSweep = now;
  // Drop windows whose newest hit is older than 10 minutes.
  for (const [k, w] of windows) {
    if (!w.hits.length || now - w.hits[w.hits.length - 1] > 600_000) windows.delete(k);
  }
  if (windows.size > MAX_KEYS) {
    // Hard cap: evict oldest-touched keys first.
    const entries = [...windows.entries()].sort(
      (a, b) => (a[1].hits[a[1].hits.length - 1] ?? 0) - (b[1].hits[b[1].hits.length - 1] ?? 0)
    );
    for (let i = 0; i < entries.length - MAX_KEYS; i++) windows.delete(entries[i][0]);
  }
}

/**
 * Synchronous burst guard. Keeps the original signature so every existing
 * call site works unchanged.
 */
export function rateLimit(key: string, max: number, windowMs: number): RateResult {
  const now = Date.now();
  sweep(now);

  let w = windows.get(key);
  if (!w) {
    w = { hits: [] };
    windows.set(key, w);
  }

  const cutoff = now - windowMs;
  // hits is sorted ascending; drop the expired prefix in one pass
  let drop = 0;
  while (drop < w.hits.length && w.hits[drop] <= cutoff) drop++;
  if (drop) w.hits.splice(0, drop);

  if (w.hits.length >= max) {
    const oldest = w.hits[0];
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      remaining: 0,
      via: "memory",
    };
  }

  w.hits.push(now);
  return { ok: true, retryAfter: 0, remaining: max - w.hits.length, via: "memory" };
}

/* ------------------------------------------------------ L2: shared store */

const UPSTASH_URL = (process.env.UPSTASH_REDIS_REST_URL ?? "").trim();
const UPSTASH_TOKEN = (process.env.UPSTASH_REDIS_REST_TOKEN ?? "").trim();

export function sharedLimiterConfigured(): boolean {
  return Boolean(UPSTASH_URL && UPSTASH_TOKEN);
}

/**
 * Global limit across every instance, using INCR + EXPIRE in one pipeline.
 * Fails OPEN: if Redis is unreachable we fall back to the in-memory answer
 * rather than locking every user out of the product.
 */
async function sharedLimit(key: string, max: number, windowMs: number): Promise<RateResult | null> {
  if (!sharedLimiterConfigured()) return null;

  const bucket = Math.floor(Date.now() / windowMs);
  const k = `nx:rl:${key}:${bucket}`;
  const ttl = Math.ceil(windowMs / 1000) + 1;

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1200); // never let the limiter add latency
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", k],
        ["EXPIRE", k, String(ttl), "NX"],
      ]),
      signal: ctrl.signal,
      cache: "no-store",
    }).finally(() => clearTimeout(t));

    if (!res.ok) return null;
    const out = (await res.json()) as { result?: number }[];
    const count = Number(out?.[0]?.result ?? 0);
    if (!Number.isFinite(count) || count <= 0) return null;

    if (count > max) {
      const msLeft = (bucket + 1) * windowMs - Date.now();
      return { ok: false, retryAfter: Math.max(1, Math.ceil(msLeft / 1000)), remaining: 0, via: "shared" };
    }
    return { ok: true, retryAfter: 0, remaining: Math.max(0, max - count), via: "shared" };
  } catch {
    return null; // fail open
  }
}

/**
 * The limit you should call on anything expensive.
 * Runs L1 first (free, instant) and only consults L2 when L1 allows — so a
 * blocked client never costs a network round trip.
 */
export async function rateLimitGlobal(key: string, max: number, windowMs: number): Promise<RateResult> {
  const local = rateLimit(key, max, windowMs);
  if (!local.ok) return local;
  const shared = await sharedLimit(key, max, windowMs);
  return shared ?? local;
}

/* ------------------------------------------------- L3: concurrency guard */

/**
 * Caps simultaneous in-flight streams for one user.
 * Returns a release function that MUST be called in a finally block.
 */
export function acquire(key: string, maxConcurrent: number): { ok: boolean; release: () => void } {
  const n = running.get(key) ?? 0;
  if (n >= maxConcurrent) {
    return { ok: false, release: () => undefined };
  }
  running.set(key, n + 1);

  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return; // double-release is a real bug source
      released = true;
      const cur = running.get(key) ?? 1;
      if (cur <= 1) running.delete(key);
      else running.set(key, cur - 1);
    },
  };
}

export function concurrencyOf(key: string): number {
  return running.get(key) ?? 0;
}

/* --------------------------------------------------------------- tiers */

/** Per-plan budgets, in one place so they are easy to tune under load. */
export const LIMITS = {
  free: { rpm: 12, burst: 4, concurrent: 2 },
  pro: { rpm: 60, burst: 10, concurrent: 4 },
} as const;

/**
 * One call that applies everything for a chat turn.
 * Usage:
 *   const gate = await guardChat(uid, isPro);
 *   if (!gate.ok) return 429 with gate.retryAfter;
 *   try { ... } finally { gate.release(); }
 */
export async function guardChat(
  uid: string,
  isPro: boolean
): Promise<RateResult & { release: () => void }> {
  const tier = isPro ? LIMITS.pro : LIMITS.free;

  // concurrency first: it is the constraint that actually protects the instance
  const slot = acquire(`conc:${uid}`, tier.concurrent);
  if (!slot.ok) {
    return {
      ok: false,
      retryAfter: 3,
      remaining: 0,
      via: "concurrency",
      release: () => undefined,
    };
  }

  const r = await rateLimitGlobal(`chat:${uid}`, tier.rpm, 60_000);
  if (!r.ok) {
    slot.release(); // do not hold a slot we are rejecting
    return { ...r, release: () => undefined };
  }
  return { ...r, release: slot.release };
}

/** Diagnostics for /api/health. */
export function limiterStats(): {
  keys: number;
  active: number;
  shared: boolean;
} {
  let active = 0;
  for (const v of running.values()) active += v;
  return { keys: windows.size, active, shared: sharedLimiterConfigured() };
}
