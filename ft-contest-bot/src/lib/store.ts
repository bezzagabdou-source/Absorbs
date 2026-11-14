/**
 * طبقة تخزين موحّدة (Key/Value + Sets + Sorted sets + Lists)
 * تدعم ثلاث واضيوف خلفية تلقائياً:
 *   1. Upstash Redis / Vercel KV  (REST)  → الأسرع والأرخص
 *   2. Postgres (Neon / Supabase / Vercel Postgres)
 *   3. ذاكرة محلية + ملف JSON (للتطوير فقط)
 */

import fs from "node:fs";
import path from "node:path";
import { isTransientError, retry } from "./retry";
import { logError } from "./errors";

export type ZItem = { member: string; score: number };

/** 🧾 حركة نقاط: كتخلّي كل تعديل للرصيد قابل للتتبع (بلا أسرار) */
export type LedgerEntry = {
  at: number;
  /** نوع الحركة: points/reward_request/reward_refund/invite/panel_set... */
  kind: string;
  userId: string;
  /** الفرق المطبَّق فعلاً (سالـب = خصم) */
  delta: number;
  /** الرصيد بعد الحركة */
  balance: number;
  /** مرجع إضافي (معرّف طلب، مسابقة...) */
  ref?: string;
};

const LEDGER_KEY = "ledger:log";

export interface Store {
  readonly backend: "redis" | "postgres" | "memory";
  get<T = unknown>(key: string): Promise<T | null>;
  /** قراءة عدة مفاتيح في نداء واحد (حيث يدعمها المخزن) */
  getMany?<T = unknown>(keys: string[]): Promise<(T | null)[]>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, by?: number): Promise<number>;
  sAdd(key: string, member: string): Promise<boolean>;
  sHas(key: string, member: string): Promise<boolean>;
  sCard(key: string): Promise<number>;
  sDel(key: string, member: string): Promise<void>;
  sMembers(key: string): Promise<string[]>;
  zIncr(key: string, member: string, by?: number): Promise<number>;
  zScore(key: string, member: string): Promise<number>;
  zTop(key: string, limit: number): Promise<ZItem[]>;
  zCount(key: string): Promise<number>;
  listPush(key: string, values: string[]): Promise<number>;
  listPop(key: string): Promise<string | null>;
  listLen(key: string): Promise<number>;
  listAll(key: string, limit?: number): Promise<string[]>;
  listRecent(key: string, limit?: number): Promise<string[]>;
  delList(key: string): Promise<void>;
  /** ✍️ كتابة مرة واحدة فقط (NX) → true إلا تولّت الكتابة */
  setIfAbsent(key: string, value: unknown): Promise<boolean>;
  /** 🧾 دفتر حركات النقاط (audit trail) — كيتسجّل ف كل تعديل للرصيد */
  appendLedger?(entry: LedgerEntry): Promise<void>;
  /** قراءة آخر حركات النقاط (للوحة/التحقيق) */
  readLedger?(limit?: number, userId?: string): Promise<LedgerEntry[]>;
  /** 🔒 قفل موقّت (lease) — البثّ ما يتكررش بين الطلبات */
  acquireLease(key: string, token: string, ttlMs: number): Promise<boolean>;
  releaseLease(key: string, token: string): Promise<void>;
}

/* ───────────────────────── Redis (Upstash REST) ───────────────────────── */

type RedisCreds = { url: string; token: string };

function redisCreds(): RedisCreds | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.KV_REST_API_URL ||
    process.env.REDIS_REST_URL ||
    "";
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.KV_REST_API_TOKEN ||
    process.env.REDIS_REST_TOKEN ||
    "";
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

const PREFIX = "ftb:";

/**
 * نداء Upstash REST واحد. كيدوز عبر retry: الشبكة و429 و5xx كيتعاودو،
 * وأخطاء الأوامر (WRONGTYPE...) ما كتتعاودش. مهلة صلبة 8 ثواني.
 */
async function redisCommand<T = unknown>(
  creds: RedisCreds,
  args: (string | number)[],
): Promise<T> {
  return retry(
    async (attempt) => {
      const res = await fetch(creds.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${creds.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(args),
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const json = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
      if (!res.ok || json.error) {
        const error = new Error(`Redis ${args[0]} failed: ${json.error || res.status}`);
        (error as Error & { code?: number }).code = res.status;
        // 429/5xx والخطأ الشبكي عابرين؛ خطأ الأمر نفسه (WRONGTYPE) دائم
        if (res.status === 429 || res.status >= 500) throw error;
        if (!json.error && res.ok) return json.result as T;
        error.name = "PermanentError";
        throw error;
      }
      void attempt;
      return json.result as T;
    },
    {
      attempts: 3,
      baseMs: 200,
      maxDelayMs: 1500,
      budgetMs: 6000,
      // لا نعاودو إلا العابر: أخطاء الأوامر الدائمة و429/5xx
      retryable: (error) => {
        const status = Number((error as { code?: number })?.code) || 0;
        if (status === 429 || status >= 500) return true;
        return isTransientError(error) && (error as Error)?.name !== "PermanentError";
      },
      onRetry: (error, attempt, delay) => {
        console.warn(`[redis] retry ${attempt} in ${delay}ms:`, (error as Error)?.message);
      },
    },
  );
}

class RedisStore implements Store {
  readonly backend = "redis" as const;
  constructor(private creds: RedisCreds) {}
  private k(key: string) {
    return PREFIX + key;
  }
  private cmd<T = unknown>(args: (string | number)[]) {
    return redisCommand<T>(this.creds, args);
  }
  async get<T>(key: string): Promise<T | null> {
    const raw = await this.cmd<string | null>(["GET", this.k(key)]);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return raw as unknown as T;
    }
  }
  async set(key: string, value: unknown) {
    await this.cmd(["SET", this.k(key), JSON.stringify(value)]);
  }
  async del(key: string) {
    await this.cmd(["DEL", this.k(key)]);
  }
  async incr(key: string, by = 1) {
    return Number(await this.cmd<number>(["INCRBY", this.k(key), by]));
  }
  async sAdd(key: string, member: string) {
    return Number(await this.cmd<number>(["SADD", this.k(key), member])) === 1;
  }
  async sHas(key: string, member: string) {
    return Number(await this.cmd<number>(["SISMEMBER", this.k(key), member])) === 1;
  }
  async sCard(key: string) {
    return Number(await this.cmd<number>(["SCARD", this.k(key)]));
  }
  async sDel(key: string, member: string) {
    await this.cmd(["SREM", this.k(key), member]);
  }
  async sMembers(key: string): Promise<string[]> {
    const raw = await this.cmd<string[]>(["SMEMBERS", this.k(key)]);
    return Array.isArray(raw) ? raw.map(String) : [];
  }
  async zIncr(key: string, member: string, by = 1) {
    return Number(await this.cmd<number>(["ZINCRBY", this.k(key), by, member]));
  }
  async zScore(key: string, member: string) {
    const v = await this.cmd<string | null>(["ZSCORE", this.k(key), member]);
    return v == null ? 0 : Number(v);
  }
  async zTop(key: string, limit: number): Promise<ZItem[]> {
    const raw = await this.cmd<(string | number)[]>([
      "ZREVRANGE",
      this.k(key),
      0,
      Math.max(0, limit - 1),
      "WITHSCORES",
    ]);
    const out: ZItem[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      out.push({ member: String(raw[i]), score: Number(raw[i + 1]) });
    }
    return out;
  }
  async zCount(key: string) {
    return Number(await this.cmd<number>(["ZCARD", this.k(key)]));
  }
  async listPush(key: string, values: string[]) {
    if (!values.length) return this.listLen(key);
    return Number(await this.cmd<number>(["LPUSH", this.k(key), ...values]));
  }
  async listPop(key: string) {
    return this.cmd<string | null>(["RPOP", this.k(key)]);
  }
  async listLen(key: string) {
    return Number(await this.cmd<number>(["LLEN", this.k(key)]));
  }
  async listAll(key: string, limit = 1000) {
    const raw = await this.cmd<string[]>([
      "LRANGE",
      this.k(key),
      0,
      Math.max(0, limit - 1),
    ]);
    return raw.map(String);
  }
  async listRecent(key: string, limit = 1000) {
    const raw = await this.cmd<string[]>(["LRANGE", this.k(key), -Math.max(1, limit), -1]);
    return raw.map(String).reverse();
  }
  async setIfAbsent(key: string, value: unknown) {
    return (await this.cmd<string | null>(["SET", this.k(key), JSON.stringify(value), "NX"])) === "OK";
  }
  async acquireLease(key: string, token: string, ttlMs: number) {
    return (await this.cmd<string | null>(["SET", this.k(key), token, "NX", "PX", Math.max(1000, ttlMs)])) === "OK";
  }
  async releaseLease(key: string, token: string) {
    await this.cmd([
      "EVAL",
      "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",
      1,
      this.k(key),
      token,
    ]);
  }
  async delList(key: string) {
    await this.del(key);
  }
  async appendLedger(entry: LedgerEntry) {
    await this.cmd(["LPUSH", this.k(LEDGER_KEY), JSON.stringify(entry)]);
    // سقف: ما نخليوش الدفتر يكبر بلا حد (آخر 5000 حركة كافية للتحقيق)
    await this.cmd(["LTRIM", this.k(LEDGER_KEY), 0, 4999]).catch(() => undefined);
  }
  async readLedger(limit = 200, userId?: string) {
    const raw = await this.cmd<string[]>(["LRANGE", this.k(LEDGER_KEY), 0, Math.max(0, limit * (userId ? 10 : 1) - 1)]);
    return (Array.isArray(raw) ? raw : [])
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as LedgerEntry;
          return row && typeof row.userId === "string" ? [row] : [];
        } catch {
          return [];
        }
      })
      .filter((row) => !userId || row.userId === userId)
      .slice(0, limit);
  }
}

/* ───────────────────────────── Postgres ───────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgPool = any;
type PgQueryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> };

const globalForDb = globalThis as unknown as {
  __ftPool?: PgPool;
  __ftPoolReady?: Promise<void>;
  __ftSchemaTried?: number;
  __ftDbHealth?: { at: number; ok: boolean; error: string };
};

/** مهلة معقولة: Vercel كيقتل الدالة بعد 60s، فما نخلّيوش الاتصال يعلق */
const DB_TIMEOUTS = {
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 15_000,
  queryTimeoutMillis: 15_000,
  statementTimeout: 15_000,
  idleInTransactionTimeout: 10_000,
};

export function postgresUrl(): string | null {
  const raw =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    "";
  if (!raw) return null;
  // بعض مزوّدي الاستضافة (Neon) يضيفون channel_binding=require وهو غير مدعوم في node-postgres
  return raw
    .replace(/([?&])channel_binding=[^&]*/g, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
}

function needsSsl(url: string): boolean {
  return !(/localhost|127\.0\.0\.1/.test(url) || /sslmode=disable/.test(url));
}

/** يبني Pool جديد (يتستعمل عند إعادة الاتصال) — الفهارس والمهل من مكان واحد */
async function makePool(url: string): Promise<PgPool> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 5,
    connectionTimeoutMillis: DB_TIMEOUTS.connectionTimeoutMillis,
    idleTimeoutMillis: DB_TIMEOUTS.idleTimeoutMillis,
    query_timeout: DB_TIMEOUTS.queryTimeoutMillis,
    statement_timeout: DB_TIMEOUTS.statementTimeout,
    idle_in_transaction_session_timeout: DB_TIMEOUTS.idleInTransactionTimeout,
    keepAlive: true,
    application_name: "ft-contest-bot",
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  });
  // ⚠️ خطأ على pool خامل ما خاصوش يقتل العملية — نسجّلو ونعاودو الاتصال
  pool.on("error", (error: Error) => {
    console.error("[db] idle client error", error?.message);
    globalForDb.__ftPoolReady = undefined;
    void logError("db", error, { kind: "pool-error" }).catch(() => undefined);
  });
  return pool;
}

/** اتصال مستقر: pool واحد لكل نسخة + إعادة بناء تلقائية بعد أي عطل */
export async function getPool(): Promise<PgPool> {
  const url = postgresUrl();
  if (!url) throw new Error("Postgres URL not configured");
  if (!globalForDb.__ftPool) {
    globalForDb.__ftPool = await makePool(url);
  }
  const pool = globalForDb.__ftPool;
  if (!globalForDb.__ftPoolReady) {
    globalForDb.__ftPoolReady = ensureSchema(pool).catch((error) => {
      // فشل الترحيل ما كيكسرش البوت: نمسحو الوعد باش نعاودو المحاولة في الطلب الجاي
      globalForDb.__ftPoolReady = undefined;
      throw error;
    });
  }
  await globalForDb.__ftPoolReady;
  return pool;
}

/** إعادة اتصال قسرية (من health-check أو بعد خطأ اتصال) */
export async function recyclePool(): Promise<void> {
  const pool = globalForDb.__ftPool;
  globalForDb.__ftPool = undefined;
  globalForDb.__ftPoolReady = undefined;
  try {
    await pool?.end?.();
  } catch {
    /* pool ميّت أصلاً */
  }
}

/** ينفّذ كل الترحيلات الناقصة مرة واحدة، ويسجّلها في ft_migrations */
async function ensureSchema(pool: PgPool): Promise<void> {
  const { MIGRATIONS } = await import("@/db/schema");
  // الجداول الأساسية أولاً حتى يقدر جدول الترحيلات يتكتب
  await pool.query(MIGRATIONS.find((m) => m.id === "0001_core_tables")!.sql);
  await pool.query(MIGRATIONS.find((m) => m.id === "0003_migrations_table")!.sql);
  const { rows } = await pool.query("select id from ft_migrations");
  const applied = new Set((rows as { id: string }[]).map((row) => String(row.id)));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await pool.query(migration.sql);
    await pool.query("insert into ft_migrations (id, note) values ($1, $2) on conflict (id) do nothing", [
      migration.id,
      migration.note,
    ]);
  }
  globalForDb.__ftSchemaTried = Date.now();
}

/** حالة الترحيلات — تظهر في /api/panel/health */
export async function migrationsInfo(): Promise<{ applied: string[]; pending: string[] }> {
  const { MIGRATIONS } = await import("@/db/schema");
  const all = MIGRATIONS.map((m) => m.id);
  try {
    const pool = await getPool();
    const { rows } = await pool.query("select id from ft_migrations");
    const applied = (rows as { id: string }[]).map((row) => String(row.id));
    return { applied, pending: all.filter((id) => !applied.includes(id)) };
  } catch {
    return { applied: [], pending: all };
  }
}

/**
 * معاملة (transaction): كل العمليات الحساسة (النقاط، الإحالات، المتجر) كتدوز هنا.
 * إعادة المحاولة كتصلح غير أعطال الاتصال — ما كتعاودش معاملة نصفها نجح.
 */
export async function transaction<T>(work: (tx: PgQueryable) => Promise<T>): Promise<T> {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      /* الاتصال طاح — الـ rollback كيديرو السيرفر بوحدو */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** نداء قاعدة بيانات مع إعادة محاولة + تسجيل عند العطل */
async function q<T = { rows: unknown[]; rowCount: number | null }>(
  pool: PgPool,
  sql: string,
  args: unknown[] = [],
  options: { attempts?: number } = {},
): Promise<T> {
  return retry(
    async () => {
      try {
        return (await pool.query(sql, args)) as T;
      } catch (error) {
        if (!isTransientError(error)) throw error;
        // أعطال الاتصال: نعاودو نبنيو الـ pool مرة واحدة
        if (/ECONNRESET|ECONNREFUSED|ENOTFOUND|EPIPE|connection terminated|Connection pool|server closed/i.test(String((error as Error)?.message))) {
          await recyclePool();
        }
        throw error;
      }
    },
    { attempts: options.attempts ?? 3, baseMs: 200, maxDelayMs: 1500, budgetMs: 8000, label: "db" },
  );
}

/** فحص صحة سريع للقاعدة (health-check) */
export async function dbHealth(): Promise<{ ok: boolean; backend: string; error: string; latencyMs: number }> {
  const started = Date.now();
  const store = getStore();
  if (store.backend !== "postgres") {
    return { ok: true, backend: store.backend, error: "", latencyMs: 0 };
  }
  try {
    const pool = await getPool();
    await q(pool, "select 1");
    globalForDb.__ftDbHealth = { at: Date.now(), ok: true, error: "" };
    return { ok: true, backend: "postgres", error: "", latencyMs: Date.now() - started };
  } catch (error) {
    const message = String((error as Error)?.message || error).slice(0, 200);
    globalForDb.__ftDbHealth = { at: Date.now(), ok: false, error: message };
    return { ok: false, backend: "postgres", error: message, latencyMs: Date.now() - started };
  }
}

class PostgresStore implements Store {
  readonly backend = "postgres" as const;
  private async db() {
    return getPool();
  }
  async get<T>(key: string): Promise<T | null> {
    const pool = await this.db();
    // ⚠️ `incr` كيكتب في عمود n و `set` في v → خاص القراءة ترجع الاثنين
    const { rows } = await q<{ rows: { v: unknown; n: string | number }[] }>(pool, "select v, n from ft_kv where k = $1", [key]);
    if (!rows.length) return null;
    if (rows[0].v !== null && rows[0].v !== undefined) return rows[0].v as T;
    return (rows[0].n ?? null) as T;
  }
  async getMany<T = unknown>(keys: string[]): Promise<(T | null)[]> {
    if (!keys.length) return [];
    const pool = await this.db();
    const { rows } = await q<{ rows: { k: string; v: unknown; n: string | number }[] }>(
      pool,
      "select k, v, n from ft_kv where k = any($1::text[])",
      [keys],
    );
    const map = new Map(rows.map((row) => [row.k, row.v !== null && row.v !== undefined ? row.v : row.n]));
    return keys.map((key) => (map.has(key) ? (map.get(key) as T) : null));
  }
  async set(key: string, value: unknown) {
    const pool = await this.db();
    // ⚠️ `n` كيتصفّر (0) مع كل `set`: بلا هادشي، `incr` من بعد `set`
    // كان كيزيد على العدّاد القديم و`get` كان كيرجع قيمة `v` القديمة → قراءة غالطة.
    await q(pool, `insert into ft_kv (k, v, n) values ($1, $2::jsonb, 0)
       on conflict (k) do update set v = excluded.v, n = 0`, [key, JSON.stringify(value)]);
  }
  async del(key: string) {
    const pool = await this.db();
    await Promise.all([
      q(pool, "delete from ft_kv where k = $1", [key]),
      q(pool, "delete from ft_set where k = $1", [key]),
      q(pool, "delete from ft_zset where k = $1", [key]),
      q(pool, "delete from ft_list where k = $1", [key]),
    ]);
  }
  async incr(key: string, by = 1) {
    const pool = await this.db();
    // الأساس = القيمة الحالية: إما JSON رقم في `v` أو العدّاد `n` (أيّهما موجود)
    const { rows } = await q<{ rows: { n: string | number }[] }>(
      pool,
      `insert into ft_kv (k, n, v) values ($1, $2::bigint, null)
       on conflict (k) do update
         set n = coalesce(nullif(ft_kv.v #>> '{}', '')::bigint, ft_kv.n, 0) + excluded.n,
             v = null
       returning n`,
      [key, by],
    );
    return Number(rows[0].n);
  }
  async sAdd(key: string, member: string) {
    const pool = await this.db();
    const { rowCount } = await q(pool, "insert into ft_set (k, m) values ($1, $2) on conflict do nothing", [key, member]);
    return rowCount === 1;
  }
  async sHas(key: string, member: string) {
    const pool = await this.db();
    const { rowCount } = await q(pool, "select 1 from ft_set where k = $1 and m = $2", [key, member]);
    return rowCount === 1;
  }
  async sCard(key: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { c: number }[] }>(pool, "select count(*)::int as c from ft_set where k = $1", [key]);
    return Number(rows[0].c);
  }
  async sDel(key: string, member: string) {
    const pool = await this.db();
    await q(pool, "delete from ft_set where k = $1 and m = $2", [key, member]);
  }
  async sMembers(key: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { m: string }[] }>(pool, "select m from ft_set where k = $1", [key]);
    return rows.map((r) => String(r.m));
  }
  async zIncr(key: string, member: string, by = 1) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { score: string | number }[] }>(pool, `insert into ft_zset (k, m, score) values ($1, $2, $3)
       on conflict (k, m) do update set score = ft_zset.score + excluded.score
       returning score`, [key, member, by]);
    return Number(rows[0].score);
  }
  async zScore(key: string, member: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { score: string | number }[] }>(pool, "select score from ft_zset where k = $1 and m = $2", [key, member]);
    return rows.length ? Number(rows[0].score) : 0;
  }
  async zTop(key: string, limit: number): Promise<ZItem[]> {
    const pool = await this.db();
    const { rows } = await q<{ rows: { m: string; score: string | number }[] }>(
      pool,
      "select m, score from ft_zset where k = $1 order by score desc, m asc limit $2",
      [key, limit],
    );
    return rows.map((r) => ({ member: r.m, score: Number(r.score) }));
  }
  async zCount(key: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { c: number }[] }>(pool, "select count(*)::int as c from ft_zset where k = $1", [key]);
    return Number(rows[0].c);
  }
  async listPush(key: string, values: string[]) {
    if (!values.length) return this.listLen(key);
    const pool = await this.db();
    // إدخال دفعة واحدة = كتابة واحدة (أسرع وأأمن من حلقة)
    const payload = values.map((v) => JSON.stringify(v));
    await q(pool, "insert into ft_list (k, v) select $1, value from jsonb_array_elements_text($2::jsonb)", [key, payload]);
    return this.listLen(key);
  }
  async listPop(key: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { v: string }[] }>(pool, `delete from ft_list where id = (
         select id from ft_list where k = $1 order by id asc limit 1
       ) returning v`, [key]);
    return rows.length ? String(rows[0].v) : null;
  }
  async listLen(key: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { c: number }[] }>(pool, "select count(*)::int as c from ft_list where k = $1", [key]);
    return Number(rows[0].c);
  }
  async listAll(key: string, limit = 1000) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { v: string }[] }>(pool, "select v from ft_list where k = $1 order by id asc limit $2", [key, limit]);
    return rows.map((r) => String(r.v));
  }
  async listRecent(key: string, limit = 1000) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { v: string }[] }>(pool, "select v from ft_list where k = $1 order by id desc limit $2", [key, Math.max(1, limit)]);
    return rows.map((r) => String(r.v));
  }
  async setIfAbsent(key: string, value: unknown) {
    const pool = await this.db();
    const res = await q(pool, "insert into ft_kv (k, v) values ($1, $2::jsonb) on conflict do nothing returning k", [key, JSON.stringify(value)]);
    return res.rowCount === 1;
  }
  async acquireLease(key: string, token: string, ttlMs: number) {
    const pool = await this.db();
    const now = Date.now();
    const res = await q(pool, `insert into ft_kv (k, v, n) values ($1, $2::jsonb, $3)
       on conflict (k) do update set v = excluded.v, n = excluded.n
       where ft_kv.n <= $4 or ft_kv.v ->> 'token' = $5
       returning k`, [key, JSON.stringify({ token }), now + Math.max(1000, ttlMs), now, token]);
    return res.rowCount === 1;
  }
  async releaseLease(key: string, token: string) {
    const pool = await this.db();
    await q(pool, "delete from ft_kv where k = $1 and v ->> 'token' = $2", [key, token]);
  }
  async delList(key: string) {
    const pool = await this.db();
    await q(pool, "delete from ft_list where k = $1", [key]);
  }
  async appendLedger(entry: LedgerEntry) {
    const pool = await this.db();
    await q(
      pool,
      "insert into ft_ledger (kind, user_id, delta, balance, ref, meta) values ($1, $2, $3, $4, $5, $6::jsonb)",
      [entry.kind || "points", entry.userId, entry.delta, entry.balance, entry.ref || "", JSON.stringify({ at: entry.at })],
    );
  }
  async readLedger(limit = 200, userId?: string) {
    const pool = await this.db();
    const { rows } = await q<{ rows: { at: string; kind: string; user_id: string; delta: string | number; balance: string | number | null; ref: string | null }[] }>(
      pool,
      userId
        ? "select at, kind, user_id, delta, balance, ref from ft_ledger where user_id = $1 order by at desc, id desc limit $2"
        : "select at, kind, user_id, delta, balance, ref from ft_ledger order by at desc, id desc limit $1",
      userId ? [userId, limit] : [limit],
    );
    return rows.map((row) => ({
      at: new Date(row.at).getTime(),
      kind: String(row.kind),
      userId: String(row.user_id),
      delta: Number(row.delta),
      balance: Number(row.balance ?? 0),
      ref: row.ref || "",
    }));
  }
}

/* ──────────────────────────── Memory ──────────────────────────── */

type MemData = {
  kv: Record<string, unknown>;
  counters: Record<string, number>;
  sets: Record<string, string[]>;
  zsets: Record<string, Record<string, number>>;
  lists: Record<string, string[]>;
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "store.json");

const memGlobal = globalThis as unknown as {
  __ftMem?: MemData;
  __ftMemTimer?: ReturnType<typeof setTimeout>;
};

function mem(): MemData {
  if (!memGlobal.__ftMem) {
    let data: MemData = { kv: {}, counters: {}, sets: {}, zsets: {}, lists: {} };
    try {
      if (fs.existsSync(DATA_FILE)) {
        data = { ...data, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
      }
    } catch {
      /* ignore corrupt file */
    }
    memGlobal.__ftMem = data;
  }
  return memGlobal.__ftMem;
}

function persist() {
  if (process.env.VERCEL) return; // لا نظام ملفات دائم على Vercel
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    clearTimeout(memGlobal.__ftMemTimer);
    memGlobal.__ftMemTimer = setTimeout(() => {
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(mem()), "utf8");
      } catch {
        /* ignore */
      }
    }, 120);
  } catch {
    /* ignore */
  }
}

class MemoryStore implements Store {
  readonly backend = "memory" as const;
  async get<T>(key: string): Promise<T | null> {
    const d = mem();
    if (key in d.kv) return d.kv[key] as T;
    if (key in d.counters) return d.counters[key] as T;
    return null;
  }
  async set(key: string, value: unknown) {
    mem().kv[key] = value;
    persist();
  }
  async del(key: string) {
    const d = mem();
    delete d.kv[key];
    delete d.counters[key];
    delete d.sets[key];
    delete d.zsets[key];
    delete d.lists[key];
    persist();
  }
  async incr(key: string, by = 1) {
    const d = mem();
    d.counters[key] = (d.counters[key] || 0) + by;
    persist();
    return d.counters[key];
  }
  async sAdd(key: string, member: string) {
    const d = mem();
    const set = (d.sets[key] ||= []);
    if (set.includes(member)) return false;
    set.push(member);
    persist();
    return true;
  }
  async sHas(key: string, member: string) {
    return (mem().sets[key] || []).includes(member);
  }
  async sCard(key: string) {
    return (mem().sets[key] || []).length;
  }
  async sDel(key: string, member: string) {
    const d = mem();
    d.sets[key] = (d.sets[key] || []).filter((m) => m !== member);
    persist();
  }
  async sMembers(key: string) {
    return [...(mem().sets[key] || [])];
  }
  async zIncr(key: string, member: string, by = 1) {
    const d = mem();
    const z = (d.zsets[key] ||= {});
    z[member] = (z[member] || 0) + by;
    persist();
    return z[member];
  }
  async zScore(key: string, member: string) {
    return mem().zsets[key]?.[member] || 0;
  }
  async zTop(key: string, limit: number): Promise<ZItem[]> {
    const z = mem().zsets[key] || {};
    return Object.entries(z)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([member, score]) => ({ member, score }));
  }
  async zCount(key: string) {
    return Object.keys(mem().zsets[key] || {}).length;
  }
  async listPush(key: string, values: string[]) {
    const d = mem();
    const list = (d.lists[key] ||= []);
    list.push(...values);
    persist();
    return list.length;
  }
  async listPop(key: string) {
    const d = mem();
    const list = (d.lists[key] ||= []);
    const v = list.shift() ?? null;
    persist();
    return v;
  }
  async listLen(key: string) {
    return (mem().lists[key] || []).length;
  }
  async listAll(key: string, limit = 1000) {
    return (mem().lists[key] || []).slice(0, limit);
  }
  async listRecent(key: string, limit = 1000) {
    const l = mem().lists[key] || [];
    return l.slice(-Math.max(1, limit)).reverse();
  }
  async setIfAbsent(key: string, value: unknown) {
    const d = mem();
    if (d.kv[key] !== undefined) return false;
    d.kv[key] = value;
    persist();
    return true;
  }
  async acquireLease(key: string, token: string, ttlMs: number) {
    const d = mem();
    const cur = d.kv[key] as { token?: string; exp?: number } | undefined;
    if (cur && Number(cur.exp) > Date.now() && cur.token !== token) return false;
    d.kv[key] = { token, exp: Date.now() + Math.max(1000, ttlMs) };
    return true;
  }
  async releaseLease(key: string, token: string) {
    const d = mem();
    const cur = d.kv[key] as { token?: string } | undefined;
    if (cur && cur.token === token) delete d.kv[key];
  }
  async delList(key: string) {
    delete mem().lists[key];
    persist();
  }
  async appendLedger(entry: LedgerEntry) {
    const list = (mem().lists[LEDGER_KEY] ||= []);
    list.unshift(JSON.stringify(entry));
    if (list.length > 5000) list.length = 5000;
    persist();
  }
  async readLedger(limit = 200, userId?: string) {
    return (mem().lists[LEDGER_KEY] || [])
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as LedgerEntry;
          return row && typeof row.userId === "string" ? [row] : [];
        } catch {
          return [];
        }
      })
      .filter((row) => !userId || row.userId === userId)
      .slice(0, limit);
  }
}

/* ───────────────────────────── resolver ───────────────────────────── */

const globalForStore = globalThis as unknown as { __ftStore?: Store };

export function getStore(): Store {
  if (globalForStore.__ftStore) return globalForStore.__ftStore;
  const creds = redisCreds();
  let store: Store;
  if (creds) store = new RedisStore(creds);
  else if (postgresUrl()) store = new PostgresStore();
  else store = new MemoryStore();
  globalForStore.__ftStore = store;
  return store;
}

export function storageInfo() {
  const store = getStore();
  return {
    backend: store.backend,
    persistent: store.backend !== "memory" || !process.env.VERCEL,
    configured: store.backend !== "memory",
  };
}
