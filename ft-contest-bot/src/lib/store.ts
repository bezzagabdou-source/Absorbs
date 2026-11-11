/**
 * طبقة تخزين موحّدة (Key/Value + Sets + Sorted sets + Lists)
 * تدعم ثلاث واجهات خلفية تلقائياً:
 *   1. Upstash Redis / Vercel KV  (REST)  → الأسرع والأرخص
 *   2. Postgres (Neon / Supabase / Vercel Postgres)
 *   3. ذاكرة محلية + ملف JSON (للتطوير فقط)
 */

import fs from "node:fs";
import path from "node:path";
import type { BotUser } from "./types";
import type { RewardRequest } from "./rewards";

export type ZItem = { member: string; score: number };

/** تسجيل الإحالة العامة وأول دخول للعضو في عملية واحدة. */
export type ReferralRegistration = {
  joiner: BotUser;
  inviter: BotUser;
  points: number;
  at: number;
};

export function referralLogEntry({ joiner, inviter, points, at }: ReferralRegistration): string {
  return JSON.stringify({
    at,
    contestId: "",
    contestTitle: "رابط البوت",
    inviterId: inviter.id,
    inviterName: inviter.firstName,
    inviterUsername: inviter.username,
    joinerId: joiner.id,
    joinerName: joiner.firstName,
    joinerUsername: joiner.username,
    points,
    counted: true,
  });
}

export interface Store {
  readonly backend: "redis" | "postgres" | "memory";
  get<T = unknown>(key: string): Promise<T | null>;
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
  /** ترتيب موحّد: الأحدث أولاً، مهما كان نوع التخزين. */
  listRecent(key: string, limit?: number): Promise<string[]>;
  delList(key: string): Promise<void>;
  /** تحديث رصيد المتجر وترتيبه كعملية واحدة. */
  adjustBalance(userId: string, value: number, absolute: boolean): Promise<number>;
  decideRewardRequest(id: string, status: "approved" | "rejected", at: number, note: string): Promise<{ request: RewardRequest | null; changed: boolean }>;
  /** الذرّية تمنع حساب العضو أكثر من مرة، حتى مع طلبات متزامنة. */
  registerReferral(input: ReferralRegistration): Promise<boolean>;
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
    if (limit <= 0) return [];
    const raw = await this.cmd<string[]>(["LRANGE", this.k(key), 0, limit - 1]);
    return raw.map(String);
  }
  async delList(key: string) {
    await this.del(key);
  }
  async adjustBalance(userId: string, value: number, absolute: boolean): Promise<number> {
    const script = `
      local current = tonumber(redis.call('GET', KEYS[1]) or '0')
      if not current then return redis.error_reply('invalid points balance') end
      local next = math.max(0, (ARGV[2] == '1' and 0 or current) + tonumber(ARGV[1]))
      redis.call('SET', KEYS[1], next)
      redis.call('ZADD', KEYS[2], next, ARGV[3])
      return next`;
    return Number(await this.cmd<number>(["EVAL", script, 2, this.k(`pts:${userId}`), this.k("pts:top"), value, absolute ? "1" : "0", userId]));
  }
  async decideRewardRequest(id: string, status: "approved" | "rejected", at: number, note: string) {
    const script = `
      local raw = redis.call('GET', KEYS[1])
      if not raw then return {0, ''} end
      local parsed, req = pcall(cjson.decode, raw)
      if not parsed or type(req) ~= 'table' then return redis.error_reply('invalid request') end
      if req.status ~= 'pending' then return {0, raw} end
      local uid = tostring(req.userId or '')
      local cost = tonumber(req.cost)
      if not string.match(uid, '^%d+$') or not cost or cost < 0 then return redis.error_reply('invalid request balance') end
      local balanceKey = KEYS[2] .. uid
      local current = tonumber(redis.call('GET', balanceKey) or '0')
      if not current then return redis.error_reply('invalid points balance') end
      local rankType = redis.call('TYPE', KEYS[3]).ok
      if rankType ~= 'none' and rankType ~= 'zset' then return redis.error_reply('invalid points ranking') end
      req.status = ARGV[1]; req.decidedAt = tonumber(ARGV[2]); req.note = ARGV[3]
      local next = cjson.encode(req)
      if ARGV[1] == 'rejected' then
        local balance = math.max(0, current) + cost
        redis.call('SET', balanceKey, balance)
        redis.call('ZADD', KEYS[3], balance, uid)
      end
      redis.call('SET', KEYS[1], next)
      return {1, next}`;
    const result = await this.cmd<[number, string]>(["EVAL", script, 3, this.k(`rreq:${id}`), this.k("pts:"), this.k("pts:top"), status, at, note]);
    return { changed: Number(result[0]) === 1, request: result[1] ? JSON.parse(result[1]) as RewardRequest : null };
  }
  async registerReferral(input: ReferralRegistration): Promise<boolean> {
    const { joiner, inviter, at } = input;
    const points = Math.max(0, Math.min(100000, Math.floor(Number(input.points) || 0)));
    if (!/^\d{1,20}$/.test(joiner.id) || !/^\d{1,20}$/.test(inviter.id) || joiner.id === inviter.id) return false;
    // Redis ينفّذ Lua بدون تداخل بين الطلبات؛ فلا يُسجّل العضو أو يُكافأ مرتين.
    const script = `
      if redis.call('SISMEMBER', KEYS[1], ARGV[1]) == 1 or redis.call('EXISTS', KEYS[2]) == 1 then return 0 end
      redis.call('SADD', KEYS[1], ARGV[1])
      redis.call('SET', KEYS[2], ARGV[2])
      redis.call('ZADD', KEYS[3], ARGV[3], ARGV[1])
      redis.call('LPUSH', KEYS[4], ARGV[4])
      redis.call('ZINCRBY', KEYS[5], 1, ARGV[5])
      redis.call('ZINCRBY', KEYS[6], 1, ARGV[5])
      redis.call('INCR', KEYS[7])
      if tonumber(ARGV[6]) > 0 then
        redis.call('INCRBY', KEYS[8], ARGV[6])
        redis.call('ZINCRBY', KEYS[9], ARGV[6], ARGV[5])
      end
      return 1`;
    const keys = ["users:ids", `user:${joiner.id}`, "users:joined", "referrals:log", "points:invites", "points:top", `refs:joined:${inviter.id}`, `pts:${inviter.id}`, "pts:top"].map((key) => this.k(key));
    const result = await this.cmd<number>(["EVAL", script, keys.length, ...keys, joiner.id, JSON.stringify(joiner), at, referralLogEntry({ ...input, points }), inviter.id, points]);
    return Number(result) === 1;
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

// Shared with the authenticated panel's transactional, versioned data tools.
export async function getPool(): Promise<PgPool> {
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
    const { rows } = await pool.query("select v, n from ft_kv where k = $1", [key]);
    if (!rows.length) return null;
    // Referral counters use INCR, which stores them in n rather than v.
    return (key.startsWith("refs:") && rows[0].v === null ? Number(rows[0].n) : rows[0].v) as T;
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
  async sDel(key: string, member: string) {
    const pool = await getPool();
    await pool.query("delete from ft_set where k = $1 and m = $2", [key, member]);
  }
  async sMembers(key: string) {
    const pool = await getPool();
    const { rows } = await pool.query("select m from ft_set where k = $1", [key]);
    return rows.map((r: { m: string }) => String(r.m));
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
  async listRecent(key: string, limit = 1000) {
    if (limit <= 0) return [];
    const pool = await getPool();
    const { rows } = await pool.query(
      "select v from ft_list where k = $1 order by id desc limit $2",
      [key, limit],
    );
    return rows.map((r: { v: string }) => String(r.v));
  }
  async delList(key: string) {
    const pool = await getPool();
    await pool.query("delete from ft_list where k = $1", [key]);
  }
  async adjustBalance(userId: string, value: number, absolute: boolean): Promise<number> {
    const pool = await getPool();
    // The UPSERT locks the balance row and updates the ranking in the same statement.
    const { rows } = await pool.query(
      `with changed as (
         insert into ft_kv (k, v) values ($1, to_jsonb(greatest(0, $3::numeric)))
         on conflict (k) do update set v = to_jsonb(greatest(0,
           case when $4::boolean then $3::numeric else coalesce((ft_kv.v #>> '{}')::numeric, 0) + $3::numeric end))
         returning (v #>> '{}')::numeric as balance
       ), ranked as (
         insert into ft_zset (k, m, score) select 'pts:top', $2, balance::double precision from changed
         on conflict (k, m) do update set score = excluded.score
       ) select balance from changed`,
      [`pts:${userId}`, userId, value, absolute],
    );
    return Number(rows[0].balance);
  }
  async decideRewardRequest(id: string, status: "approved" | "rejected", at: number, note: string) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await client.query("select v from ft_kv where k = $1 for update", [`rreq:${id}`]);
      const request = (result.rows[0]?.v || null) as RewardRequest | null;
      if (!request || request.status !== "pending") {
        await client.query("rollback");
        return { request, changed: false };
      }
      const cost = Number(request.cost);
      if (!/^\d{1,20}$/.test(String(request.userId)) || !Number.isSafeInteger(cost) || cost < 0) throw new Error("invalid request balance");
      if (status === "rejected") {
        await client.query(
          `with changed as (
             insert into ft_kv (k, v) values ($1, to_jsonb($3::numeric))
             on conflict (k) do update set v = to_jsonb(greatest(0, coalesce((ft_kv.v #>> '{}')::numeric, 0)) + $3::numeric)
             returning (v #>> '{}')::numeric as balance
           ), ranked as (
             insert into ft_zset (k, m, score) select 'pts:top', $2, balance::double precision from changed
             on conflict (k, m) do update set score = excluded.score
           ) select balance from changed`,
          [`pts:${request.userId}`, request.userId, cost],
        );
      }
      const next: RewardRequest = { ...request, status, decidedAt: at, note };
      await client.query("update ft_kv set v = $2::jsonb where k = $1", [`rreq:${id}`, JSON.stringify(next)]);
      await client.query("commit");
      return { request: next, changed: true };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }
  async registerReferral(input: ReferralRegistration): Promise<boolean> {
    const { joiner, inviter, at } = input;
    const points = Math.max(0, Math.min(100000, Math.floor(Number(input.points) || 0)));
    if (!/^\d{1,20}$/.test(joiner.id) || !/^\d{1,20}$/.test(inviter.id) || joiner.id === inviter.id) return false;
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Existing users, including legacy records, cannot become somebody's new referral.
      const old = await client.query("select 1 from ft_kv where k = $1", [`user:${joiner.id}`]);
      if (old.rowCount) {
        await client.query("rollback");
        return false;
      }
      const claimed = await client.query(
        "insert into ft_set (k, m) values ($1, $2) on conflict do nothing returning m",
        ["users:ids", joiner.id],
      );
      if (!claimed.rowCount) {
        await client.query("rollback");
        return false;
      }
      await client.query("insert into ft_kv (k, v) values ($1, $2::jsonb)", [`user:${joiner.id}`, JSON.stringify(joiner)]);
      await client.query(
        `insert into ft_zset (k, m, score) values ($1, $2, $3)
         on conflict (k, m) do update set score = excluded.score`,
        ["users:joined", joiner.id, at],
      );
      await client.query("insert into ft_list (k, v) values ($1, $2)", ["referrals:log", referralLogEntry({ ...input, points })]);
      for (const key of ["points:invites", "points:top"]) {
        await client.query(
          `insert into ft_zset (k, m, score) values ($1, $2, 1)
           on conflict (k, m) do update set score = ft_zset.score + 1`,
          [key, inviter.id],
        );
      }
      await client.query(
        `insert into ft_kv (k, n) values ($1, 1)
         on conflict (k) do update set n = ft_kv.n + 1`,
        [`refs:joined:${inviter.id}`],
      );
      if (points > 0) {
        await client.query(
          `insert into ft_kv (k, v) values ($1, to_jsonb($2::int))
           on conflict (k) do update set v = to_jsonb(coalesce((ft_kv.v #>> '{}')::numeric, 0) + $2::int)`,
          [`pts:${inviter.id}`, points],
        );
        await client.query(
          `insert into ft_zset (k, m, score) values ($1, $2, $3)
           on conflict (k, m) do update set score = ft_zset.score + excluded.score`,
          ["pts:top", inviter.id, points],
        );
      }
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
    return key.startsWith("refs:") && key in d.counters ? (d.counters[key] as T) : null;
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
    if (limit <= 0) return [];
    return (mem().lists[key] || []).slice(-limit).reverse();
  }
  async delList(key: string) {
    delete mem().lists[key];
    persist();
  }
  async adjustBalance(userId: string, value: number, absolute: boolean): Promise<number> {
    const d = mem();
    const current = Number(d.kv[`pts:${userId}`] || 0);
    if (!Number.isFinite(current)) throw new Error("invalid points balance");
    const next = Math.max(0, (absolute ? 0 : current) + value);
    d.kv[`pts:${userId}`] = next;
    (d.zsets["pts:top"] ||= {})[userId] = next;
    persist();
    return next;
  }
  async decideRewardRequest(id: string, status: "approved" | "rejected", at: number, note: string) {
    const d = mem();
    const request = (d.kv[`rreq:${id}`] || null) as RewardRequest | null;
    if (!request || request.status !== "pending") return { request, changed: false };
    const cost = Number(request.cost);
    if (!/^\d{1,20}$/.test(String(request.userId)) || !Number.isSafeInteger(cost) || cost < 0) throw new Error("invalid request balance");
    if (status === "rejected") {
      const current = Number(d.kv[`pts:${request.userId}`] || 0);
      if (!Number.isFinite(current)) throw new Error("invalid points balance");
      const balance = Math.max(0, current) + cost;
      d.kv[`pts:${request.userId}`] = balance;
      (d.zsets["pts:top"] ||= {})[request.userId] = balance;
    }
    const next: RewardRequest = { ...request, status, decidedAt: at, note };
    d.kv[`rreq:${id}`] = next;
    persist();
    return { request: next, changed: true };
  }
  async registerReferral(input: ReferralRegistration): Promise<boolean> {
    const { joiner, inviter, at } = input;
    const points = Math.max(0, Math.min(100000, Math.floor(Number(input.points) || 0)));
    if (!/^\d{1,20}$/.test(joiner.id) || !/^\d{1,20}$/.test(inviter.id) || joiner.id === inviter.id) return false;
    const d = mem();
    const users = (d.sets["users:ids"] ||= []);
    if (users.includes(joiner.id) || `user:${joiner.id}` in d.kv) return false;
    users.push(joiner.id);
    d.kv[`user:${joiner.id}`] = joiner;
    (d.zsets["users:joined"] ||= {})[joiner.id] = at;
    (d.lists["referrals:log"] ||= []).push(referralLogEntry({ ...input, points }));
    for (const key of ["points:invites", "points:top"]) {
      const z = (d.zsets[key] ||= {});
      z[inviter.id] = (z[inviter.id] || 0) + 1;
    }
    const joinedKey = `refs:joined:${inviter.id}`;
    d.counters[joinedKey] = (d.counters[joinedKey] || 0) + 1;
    if (points > 0) {
      const balanceKey = `pts:${inviter.id}`;
      d.kv[balanceKey] = (Number(d.kv[balanceKey]) || 0) + points;
      const top = (d.zsets["pts:top"] ||= {});
      top[inviter.id] = (top[inviter.id] || 0) + points;
    }
    persist();
    return true;
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
