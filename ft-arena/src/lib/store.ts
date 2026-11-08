/**
 * طبقة التخزين — مصدر واحد للحقيقة.
 *  1) Redis (ioredis)  → سرعة فائقة وقفل موزّع للتعديلات المتزامنة.
 *  2) Vercel Blob      → نسخة احتياطية دائمة تعمل تلقائيًا إن غاب/فشل Redis.
 *  3) الذاكرة          → للتجربة المحلية فقط.
 * كل التغييرات تمرّ عبر mutate() لضمان عدم ضياع نقاط أي مستخدم.
 */
import crypto from "node:crypto";
import { env } from "./env";
import { freshDB, migrate } from "./defaults";
import type { DB, ActivityItem } from "./types";

const DB_KEY = "ftarena:db:v1";
const LOCK_KEY = "ftarena:lock:v1";

type BlobMod = typeof import("@vercel/blob");
let blobMod: BlobMod | null | undefined;

async function getBlob(): Promise<BlobMod | null> {
  if (blobMod !== undefined) return blobMod;
  if (!env.blobToken) return (blobMod = null);
  try {
    blobMod = await import("@vercel/blob");
  } catch {
    blobMod = null;
  }
  return blobMod;
}

type RedisLike = import("ioredis").default;
const g = globalThis as typeof globalThis & {
  __ftRedis?: RedisLike | null;
  __ftCache?: { db: DB; at: number } | null;
  __ftMem?: DB | null;
};

async function getRedis(): Promise<RedisLike | null> {
  if (g.__ftRedis !== undefined) return g.__ftRedis;
  const url = env.redisUrl;
  if (!url) return (g.__ftRedis = null);
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      connectTimeout: env.httpTimeoutMs,
      keepAlive: 15000,
      commandTimeout: env.httpTimeoutMs,
      // بعد فشل اتصال متكرر نتوقف عن المحاولة (حتى لا يعلّق أي طلب)
      retryStrategy: (times: number) => (times > 5 ? null : Math.min(times * 250, 2000)),
      tls: url.startsWith("rediss://") ? {} : undefined,
    });
    // فشل الاتصال نهائيًا → نتخلّى عن Redis ونكمل على Blob/الذاكرة بلا تعليق
    client.on("error", (e: Error) => {
      console.error("[redis]", e.message);
    });
    client.on("end", () => {
      console.error("[redis] connection ended — falling back to blob/memory");
      g.__ftRedis = null;
    });
    g.__ftRedis = client;
    return client;
  } catch (e) {
    console.error("[redis] init failed", (e as Error).message);
    return (g.__ftRedis = null);
  }
}

/* ───────────────────────────── Blob fallback ───────────────────────────── */

function blobPrefix(): string {
  const hash = crypto
    .createHash("sha256")
    .update(`ftarena:${env.authSecret}:${env.webhookSecret}`)
    .digest("hex")
    .slice(0, 16);
  return `ftarena-${hash}`;
}
const BLOB_PATH = () => `${blobPrefix()}/db.json`;

async function readBlob(): Promise<DB | null> {
  const blob = await getBlob();
  if (!blob) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), env.httpTimeoutMs);
  try {
    const { list } = blob;
    const res = await list({ prefix: blobPrefix(), limit: 10, token: env.blobToken, abortSignal: ctl.signal });
    const file = res.blobs.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt))[0];
    if (!file) return null;
    const r = await fetch(`${file.url}?t=${Date.now()}`, { cache: "no-store", signal: ctl.signal });
    if (!r.ok) return null;
    return (await r.json()) as DB;
  } catch (e) {
    console.error("[blob] read failed", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function writeBlob(db: DB): Promise<boolean> {
  const blob = await getBlob();
  if (!blob) return false;
  try {
    await blob.put(BLOB_PATH(), JSON.stringify(db), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
      token: env.blobToken,
    });
    return true;
  } catch (e) {
    console.error("[blob] write failed", (e as Error).message);
    return false;
  }
}

/* ───────────────────────────── القفل الموزّع ───────────────────────────── */

async function acquire(redis: RedisLike, ttlMs = 6000): Promise<string | null> {
  const token = crypto.randomBytes(8).toString("hex");
  for (let i = 0; i < 40; i++) {
    const ok = await redis.set(LOCK_KEY, token, "PX", ttlMs, "NX");
    if (ok === "OK") return token;
    await new Promise((r) => setTimeout(r, 25 + Math.random() * 40));
  }
  return null;
}

async function release(redis: RedisLike, token: string) {
  try {
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      LOCK_KEY,
      token
    );
  } catch {
    /* ignore */
  }
}

/* ───────────────────────────── قراءة / كتابة ───────────────────────────── */

export type StoreMode = "redis" | "blob" | "memory";

export async function storeMode(): Promise<StoreMode> {
  const redis = await getRedis();
  if (redis) return "redis";
  if (env.blobToken) return "blob";
  return "memory";
}

/** أي عملية Redis يجب أن تفشل بسرعة — نغلّفها بمهلة صارمة */
async function redisGet(redis: RedisLike, key: string): Promise<string | null> {
  return Promise.race([
    redis.get(key),
    new Promise<null>((_, rej) => setTimeout(() => rej(new Error("redis get timeout")), env.httpTimeoutMs)),
  ]);
}
async function redisSet(redis: RedisLike, key: string, value: string): Promise<void> {
  await Promise.race([
    redis.set(key, value),
    new Promise<void>((_, rej) => setTimeout(() => rej(new Error("redis set timeout")), env.httpTimeoutMs)),
  ]);
}

export async function loadDB(): Promise<DB> {
  const cached = g.__ftCache;
  if (cached && Date.now() - cached.at < 1200) return cached.db;

  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redisGet(redis, DB_KEY);
      const db = raw ? migrate(JSON.parse(raw) as DB) : freshDB();
      g.__ftCache = { db, at: Date.now() };
      return db;
    } catch (e) {
      console.error("[store] redis read failed, trying blob", (e as Error).message);
    }
  }
  const fromBlob = await readBlob();
  const db = fromBlob ? migrate(fromBlob) : g.__ftMem ?? freshDB();
  g.__ftCache = { db, at: Date.now() };
  return db;
}

export async function saveDB(db: DB): Promise<void> {
  db.updatedAt = new Date().toISOString();
  g.__ftCache = { db, at: Date.now() };
  g.__ftMem = db;
  const redis = await getRedis();
  if (redis) {
    try {
      await redisSet(redis, DB_KEY, JSON.stringify(db));
      return;
    } catch (e) {
      console.error("[store] redis write failed, falling back to blob", (e as Error).message);
    }
  }
  if (env.blobToken) {
    const ok = await writeBlob(db);
    if (ok) return;
  }
}

/** تعديل ذرّي آمن — كل عمليات النقاط تمرّ من هنا */
export async function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const redis = await getRedis();
  if (!redis) {
    const db = await loadDB();
    g.__ftCache = null;
    const result = await fn(db);
    await saveDB(db);
    return result;
  }
  const token = await acquire(redis);
  try {
    if (!token) {
      // لم نُحصل على القفل: نقرأ من Redis مباشرة (بدون كاش) ونكتب
      const raw = await redisGet(redis, DB_KEY);
      const db = raw ? migrate(JSON.parse(raw) as DB) : freshDB();
      const result = await fn(db);
      await redisSet(redis, DB_KEY, JSON.stringify(db));
      g.__ftCache = { db, at: Date.now() };
      return result;
    }
    const raw = await redisGet(redis, DB_KEY);
    const db = raw ? migrate(JSON.parse(raw) as DB) : freshDB();
    g.__ftCache = { db, at: Date.now() };
    const result = await fn(db);
    await redisSet(redis, DB_KEY, JSON.stringify(db));
    return result;
  } finally {
    if (token) await release(redis, token);
  }
}

/* ───────────────────────────── أدوات مساعدة ───────────────────────────── */

export function logActivity(db: DB, item: Omit<ActivityItem, "at">) {
  db.activity.unshift({ at: new Date().toISOString(), ...item });
  if (db.activity.length > 300) db.activity.length = 300;
}

export function pushEvent(db: DB, type: DB["events"][number]["type"], userId?: number, meta?: string) {
  const day = new Date().toISOString().slice(0, 10);
  if (db.counters.visitsDay !== day) {
    db.counters.visitsDay = day;
    db.counters.visitsToday = 0;
  }
  db.events.push({ at: new Date().toISOString(), type, userId, meta });
  if (db.events.length > 5000) db.events.splice(0, db.events.length - 5000);
}
