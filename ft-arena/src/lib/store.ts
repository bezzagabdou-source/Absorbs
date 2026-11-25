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

const DB_KEY = "mx:db:v1";
const LOCK_KEY = "mx:lock:v1";

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
  __lastPersist?: { at: number; mode: string; ok: boolean };
  __lastRedisError?: { at: number; op: string; message: string };
  __lastReadSource?: string;
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
    .update(`mx:${env.authSecret}:${env.webhookSecret}`)
    .digest("hex")
    .slice(0, 16);
  return `mx-${hash}`;
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
  try {
    return await Promise.race([
      redis.get(key),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("redis get timeout")), env.httpTimeoutMs)),
    ]);
  } catch (e) {
    g.__lastRedisError = { at: Date.now(), op: "get", message: (e as Error).message.slice(0, 200) };
    throw e;
  }
}
async function redisSet(redis: RedisLike, key: string, value: string): Promise<void> {
  try {
    await Promise.race([
      redis.set(key, value),
      new Promise<void>((_, rej) => setTimeout(() => rej(new Error("redis set timeout")), env.httpTimeoutMs)),
    ]);
  } catch (e) {
    g.__lastRedisError = { at: Date.now(), op: "set", message: (e as Error).message.slice(0, 200) };
    throw e;
  }
}

/**
 * القراءة: Redis أولًا (مصدر الحقيقة). Blob احتياطي فقط عند فشل Redis.
 * ملاحظة مهمة: Blob قد يحتوي نسخة قديمة — لذلك لا نقرأه إلا إذا فشل Redis فعلًا،
 * ولا نكتب فيه أبدًا إن كان Redis يعمل (وإلا انقسمت البيانات وضاعت النقاط).
 */
export async function loadDB(): Promise<DB> {
  const cached = g.__ftCache;
  if (cached && Date.now() - cached.at < 1200) return cached.db;

  const redis = await getRedis();
  if (redis) {
    try {
      const raw = await redisGet(redis, DB_KEY);
      const db = raw ? migrate(JSON.parse(raw) as DB) : freshDB();
      g.__lastReadSource = "redis";
      g.__ftCache = { db, at: Date.now() };
      return db;
    } catch (e) {
      console.error("[store] redis read failed, trying blob", (e as Error).message);
    }
  }
  const fromBlob = await readBlob();
  const db = fromBlob ? migrate(fromBlob) : g.__ftMem ?? freshDB();
  g.__lastReadSource = fromBlob ? "blob" : "memory";
  g.__ftCache = { db, at: Date.now() };
  return db;
}

/** يُرجع true فقط إذا وصلت الكتابة فعلًا إلى مكان دائم (Redis أو Blob). */
export async function saveDB(db: DB): Promise<boolean> {
  db.updatedAt = new Date().toISOString();
  g.__ftCache = { db, at: Date.now() };
  g.__ftMem = db;
  const redis = await getRedis();
  if (redis) {
    try {
      await redisSet(redis, DB_KEY, JSON.stringify(db));
      g.__lastPersist = { at: Date.now(), mode: "redis", ok: true };
      return true;
    } catch (e) {
      console.error("[store] redis write failed, falling back to blob", (e as Error).message);
    }
  }
  if (env.blobToken) {
    // Blob مكتوب فقط كنسخة احتياطية صامتة حين يكون Redis متاحًا (لا نقرأ منه طالما Redis حيّ)
    const ok = await writeBlob(db);
    g.__lastPersist = { at: Date.now(), mode: redis ? "redis(backup blob failed)" : "blob", ok };
    if (ok || redis) return true;
  }
  g.__lastPersist = { at: Date.now(), mode: redis ? "redis+blob" : env.blobToken ? "blob" : "memory", ok: false };
  return false;
}

/** آخر محاولة كتابة — للتشخيص وللردود الصادقة */
export function lastRedisError() {
  return (globalThis as typeof globalThis & { __lastRedisError?: { at: number; op: string; message: string } })
    .__lastRedisError ?? null;
}

export function lastReadSource(): string {
  return (globalThis as typeof globalThis & { __lastReadSource?: string }).__lastReadSource ?? "none";
}

export function lastPersist() {
  return (globalThis as typeof globalThis & { __lastPersist?: { at: number; mode: string; ok: boolean } }).__lastPersist ?? null;
}

/**
 * تعديل ذرّي آمن — كل عمليات النقاط والتعديلات تمرّ من هنا.
 * قاعدة صارمة: لا نُعيد نتيجة العملية إلا إذا ثُبِّتت الكتابة فعلًا،
 * وإلا نرمي خطأً حتى لا يقول البوت/الذكاء «تم» وهو لم يفعل شيئًا.
 */
export async function mutate<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const redis = await getRedis();
  if (!redis) {
    const db = await loadDB();
    g.__ftCache = null;
    const result = await fn(db);
    const ok = await saveDB(db);
    if (!ok) throw new Error("تعذّر حفظ التعديل (لا Redis ولا Blob) — لم يُطبَّق شيء");
    return result;
  }
  const token = await acquire(redis);
  const writeRedis = async (db: DB) => {
    // فشل الكتابة هنا يجب أن يصل للمستخدم كخطأ — لا نجاح وهمي ولا سقوط إلى Blob
    db.updatedAt = new Date().toISOString();
    await redisSet(redis, DB_KEY, JSON.stringify(db));
    g.__ftCache = { db, at: Date.now() };
    g.__lastPersist = { at: Date.now(), mode: "redis", ok: true };
  };
  try {
    if (!token) {
      // لم نُحصل على القفل: نقرأ من Redis مباشرة (بدون كاش) ونكتب
      const raw = await redisGet(redis, DB_KEY);
      const db = raw ? migrate(JSON.parse(raw) as DB) : freshDB();
      const result = await fn(db);
      await writeRedis(db);
      return result;
    }
    const raw = await redisGet(redis, DB_KEY);
    const db = raw ? migrate(JSON.parse(raw) as DB) : freshDB();
    g.__ftCache = { db, at: Date.now() };
    const result = await fn(db);
    await writeRedis(db);
    return result;
  } finally {
    if (token) await release(redis, token);
  }
}

/** قراءة مباشرة من Redis (تتجاوز الكاش) — للتحقق أن الكتابة وصلت */
export async function readFresh(): Promise<DB | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const raw = await redisGet(redis, DB_KEY);
    return raw ? migrate(JSON.parse(raw) as DB) : null;
  } catch {
    return null;
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
