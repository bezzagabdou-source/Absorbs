/**
 * طبقة تخزين موحّدة (Key/Value + Sets + Sorted sets + Lists)
 * تدعم ثلاث واجهات خلفية تلقائياً:
 *   1. Upstash Redis / Vercel KV  (REST)  → الأسرع والأرخص
 *   2. Postgres (Neon / Supabase / Vercel Postgres)
 *   3. ذاكرة محلية + ملف JSON (للتطوير فقط)
 */

import fs from "node:fs";
import path from "node:path";

export type ZItem = { member: string; score: number };

export interface Store {
  readonly backend: "redis" | "postgres" | "memory";
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  incr(key: string, by?: number): Promise<number>;
  sAdd(key: string, member: string): Promise<boolean>;
  sHas(key: string, member: string): Promise<boolean>;
  sCard(key: string): Promise<number>;
  zIncr(key: string, member: string, by?: number): Promise<number>;
  zScore(key: string, member: string): Promise<number>;
  zTop(key: string, limit: number): Promise<ZItem[]>;
  zCount(key: string): Promise<number>;
  listPush(key: string, values: string[]): Promise<number>;
  listPop(key: string): Promise<string | null>;
  listLen(key: string): Promise<number>;
  listAll(key: string, limit?: number): Promise<string[]>;
  delList(key: string): Promise<void>;
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

async function redisCommand<T = unknown>(
  creds: RedisCreds,
  args: (string | number)[],
): Promise<T> {
  const res = await fetch(creds.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: string };
  if (!res.ok || json.error) {
    throw new Error(`Redis ${args[0]} failed: ${json.error || res.status}`);
  }
  return json.result as T;
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
  async delList(key: string) {
    await this.del(key);
  }
}

/* ───────────────────────────── Postgres ───────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PgPool = any;

const globalForDb = globalThis as unknown as {
  __ftPool?: PgPool;
  __ftPoolReady?: Promise<void>;
};

function postgresUrl(): string | null {
  const raw =
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    "";
  if (!raw) return null;
  // بعض مزوّدي الاستضافة (Neon) يضيفون channel_binding=require وهو غير مدعوم في node-postgres
  return raw
    .replace(/([?&])channel_binding=[^&]*/g, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?");
}

async function getPool(): Promise<PgPool> {
  const url = postgresUrl();
  if (!url) throw new Error("Postgres URL not configured");
  if (!globalForDb.__ftPool) {
    const { Pool } = await import("pg");
    globalForDb.__ftPool = new Pool({
      connectionString: url,
      max: 3,
      ssl:
        /localhost|127\.0\.0\.1/.test(url) || /sslmode=disable/.test(url)
          ? undefined
          : { rejectUnauthorized: false },
    });
  }
  const pool = globalForDb.__ftPool;
  if (!globalForDb.__ftPoolReady) {
    globalForDb.__ftPoolReady = (async () => {
      await pool.query(`
        create table if not exists ft_kv (
          k text primary key,
          v jsonb,
          n bigint not null default 0
        );
        create table if not exists ft_set (
          k text not null,
          m text not null,
          primary key (k, m)
        );
        create table if not exists ft_zset (
          k text not null,
          m text not null,
          score double precision not null default 0,
          primary key (k, m)
        );
        create table if not exists ft_list (
          id bigserial primary key,
          k text not null,
          v text not null
        );
        create index if not exists ft_list_k_idx on ft_list (k, id);
      `);
    })();
  }
  await globalForDb.__ftPoolReady;
  return pool;
}

class PostgresStore implements Store {
  readonly backend = "postgres" as const;
  async get<T>(key: string): Promise<T | null> {
    const pool = await getPool();
    const { rows } = await pool.query("select v from ft_kv where k = $1", [key]);
    if (!rows.length) return null;
    return rows[0].v as T;
  }
  async set(key: string, value: unknown) {
    const pool = await getPool();
    await pool.query(
      `insert into ft_kv (k, v) values ($1, $2::jsonb)
       on conflict (k) do update set v = excluded.v`,
      [key, JSON.stringify(value)],
    );
  }
  async del(key: string) {
    const pool = await getPool();
    await Promise.all([
      pool.query("delete from ft_kv where k = $1", [key]),
      pool.query("delete from ft_set where k = $1", [key]),
      pool.query("delete from ft_zset where k = $1", [key]),
      pool.query("delete from ft_list where k = $1", [key]),
    ]);
  }
  async incr(key: string, by = 1) {
    const pool = await getPool();
    const { rows } = await pool.query(
      `insert into ft_kv (k, n) values ($1, $2)
       on conflict (k) do update set n = ft_kv.n + excluded.n
       returning n`,
      [key, by],
    );
    return Number(rows[0].n);
  }
  async sAdd(key: string, member: string) {
    const pool = await getPool();
    const { rowCount } = await pool.query(
      "insert into ft_set (k, m) values ($1, $2) on conflict do nothing",
      [key, member],
    );
    return rowCount === 1;
  }
  async sHas(key: string, member: string) {
    const pool = await getPool();
    const { rowCount } = await pool.query(
      "select 1 from ft_set where k = $1 and m = $2",
      [key, member],
    );
    return rowCount === 1;
  }
  async sCard(key: string) {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select count(*)::int as c from ft_set where k = $1",
      [key],
    );
    return Number(rows[0].c);
  }
  async zIncr(key: string, member: string, by = 1) {
    const pool = await getPool();
    const { rows } = await pool.query(
      `insert into ft_zset (k, m, score) values ($1, $2, $3)
       on conflict (k, m) do update set score = ft_zset.score + excluded.score
       returning score`,
      [key, member, by],
    );
    return Number(rows[0].score);
  }
  async zScore(key: string, member: string) {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select score from ft_zset where k = $1 and m = $2",
      [key, member],
    );
    return rows.length ? Number(rows[0].score) : 0;
  }
  async zTop(key: string, limit: number): Promise<ZItem[]> {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select m, score from ft_zset where k = $1 order by score desc, m asc limit $2",
      [key, limit],
    );
    return rows.map((r: { m: string; score: number }) => ({
      member: r.m,
      score: Number(r.score),
    }));
  }
  async zCount(key: string) {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select count(*)::int as c from ft_zset where k = $1",
      [key],
    );
    return Number(rows[0].c);
  }
  async listPush(key: string, values: string[]) {
    if (!values.length) return this.listLen(key);
    const pool = await getPool();
    for (const v of values) {
      await pool.query("insert into ft_list (k, v) values ($1, $2)", [key, v]);
    }
    return this.listLen(key);
  }
  async listPop(key: string) {
    const pool = await getPool();
    const { rows } = await pool.query(
      `delete from ft_list where id = (
         select id from ft_list where k = $1 order by id asc limit 1
       ) returning v`,
      [key],
    );
    return rows.length ? String(rows[0].v) : null;
  }
  async listLen(key: string) {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select count(*)::int as c from ft_list where k = $1",
      [key],
    );
    return Number(rows[0].c);
  }
  async listAll(key: string, limit = 1000) {
    const pool = await getPool();
    const { rows } = await pool.query(
      "select v from ft_list where k = $1 order by id asc limit $2",
      [key, limit],
    );
    return rows.map((r: { v: string }) => String(r.v));
  }
  async delList(key: string) {
    const pool = await getPool();
    await pool.query("delete from ft_list where k = $1", [key]);
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
    return (key in d.kv ? (d.kv[key] as T) : null);
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
  async delList(key: string) {
    delete mem().lists[key];
    persist();
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
