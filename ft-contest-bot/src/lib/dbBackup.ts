/**
 * 💾 نسخ احتياطي + دمج قاعدة قديمة في القاعدة الحالية (Postgres فقط).
 *
 * كل شيء هنا يتعامل مع القاعدة **مباشرة** (لا يمرّ على طبقة الاحتياط)، حتى لا
 * نصدّر أبداً بيانات مؤقتة على أنها القاعدة الحقيقية: إن كانت القاعدة معطّلة
 * فالنداء يفشل بخطأ واضح.
 *
 * الدمج (القديمة → الحالية) idempotent ولا يحذف شيئاً من أي جهة:
 *   ft_set   : اتحاد.
 *   ft_list  : صفوف القديمة تدخل بمعرّفات سالبة (قبل الجديدة وبنفس ترتيبها).
 *   ft_zset  : غير موجود → يُضاف؛ موجود → مجموع النقاط، مرة واحدة فقط.
 *   ft_kv    : غير موجود → يُضاف. موجود في الجهتين:
 *                – عدّادان/رقمان → المجموع مرة واحدة (الطوابع الزمنية: الأقدم).
 *                – غير ذلك → **القديمة تفوز** (بيانات الأصل)، وقيمة الحالية
 *                  تُحفظ في ft_import_conflicts للمراجعة. لا شيء يضيع.
 *   ft_ledger: صفوف القديمة بمعرّفات سالبة.
 * علامات التطبيق في ft_import_log تمنع أي عدّ مزدوج عند إعادة التشغيل.
 */
import crypto from "node:crypto";
import { getPool, postgresUrl } from "./store";

type Row = Record<string, unknown>;
type Queryable = { query: (sql: string, args?: unknown[]) => Promise<{ rows: Row[]; rowCount: number | null }> };

const TABLES = ["ft_kv", "ft_set", "ft_zset", "ft_list", "ft_ledger"] as const;
/** مفاتيح تشغيلية لا تُنقل: أقفال، علامات السجلّ، منع تكرار التحديثات */
const SKIP_KEY = /^(journal:|lock:|lease:|recovery:|tg:seen|upd:seen|seen:)/;

function cleanUrl(raw: string) {
  return raw.replace(/([?&])channel_binding=[^&]*/g, "$1").replace(/[?&]$/, "").replace(/\?&/, "?");
}

/** بصمة للمصدر بلا أسرار (الخادم + اسم القاعدة فقط) */
export function sourceFingerprint(url: string) {
  try {
    const u = new URL(url);
    return crypto.createHash("sha256").update(`${u.hostname}:${u.port}${u.pathname}`).digest("hex").slice(0, 16);
  } catch {
    return "unknown";
  }
}

export function describeUrl(url: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return { host: u.hostname, database: u.pathname.replace(/^\//, ""), fingerprint: sourceFingerprint(url) };
  } catch {
    return { host: "invalid-url", database: "", fingerprint: "unknown" };
  }
}

export function oldDatabaseUrl(): string | null {
  const raw = String(process.env.OLD_DATABASE_URL || process.env.LEGACY_DATABASE_URL || "").trim();
  return raw ? cleanUrl(raw) : null;
}

async function openPool(url: string) {
  const { Pool } = await import("pg");
  const local = /localhost|127\.0\.0\.1/.test(url) || /sslmode=disable/.test(url);
  return new Pool({
    connectionString: url,
    max: 2,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 60_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  });
}

async function tableExists(db: Queryable, table: string) {
  const { rows } = await db.query("select to_regclass($1) as t", [`public.${table}`]);
  return Boolean(rows[0]?.t);
}

/** أعداد قابلة للمقارنة قبل/بعد — بلا أي بيانات شخصية */
export async function countsOf(db: Queryable) {
  const out: Record<string, unknown> = {};
  const tables: Record<string, number> = {};
  for (const table of TABLES) {
    tables[table] = (await tableExists(db, table)) ? Number((await db.query(`select count(*)::bigint as c from ${table}`)).rows[0].c) : -1;
  }
  out.tables = tables;
  if (tables.ft_kv < 0) return out;
  const one = async (sql: string, args: unknown[] = []) => Number((await db.query(sql, args)).rows[0]?.c ?? 0);
  out.users = await one("select count(*)::bigint as c from ft_set where k = 'users:ids'");
  out.userRecords = await one("select count(*)::bigint as c from ft_kv where k like 'user:%'");
  out.pointsWallets = await one("select count(*)::bigint as c from ft_kv where k like 'pts:%'");
  out.pointsTotal = await one(
    `select coalesce(sum(case when v is null then n
                              when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
                              else 0 end), 0)::bigint as c
       from ft_kv where k like 'pts:%'`,
  );
  out.referralCounters = await one("select count(*)::bigint as c from ft_kv where k like 'refs:joined:%'");
  out.referralsTotal = await one(
    `select coalesce(sum(case when v is null then n
                              when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
                              else 0 end), 0)::bigint as c
       from ft_kv where k like 'refs:joined:%'`,
  );
  out.contestReferralMarks = await one("select count(*)::bigint as c from ft_kv where k like 'refbtot:%'");
  out.contests = await one("select count(*)::bigint as c from ft_set where k = 'contests:ids'");
  out.rewardRequests = await one("select count(*)::bigint as c from ft_kv where k like 'rreq:%'");
  const prefixes = await db.query(
    `select split_part(k, ':', 1) as p, count(*)::bigint as c from ft_kv group by 1 order by 2 desc limit 60`,
  );
  out.kvByPrefix = Object.fromEntries(prefixes.rows.map((r) => [String(r.p), Number(r.c)]));
  const sets = await db.query(`select k, count(*)::bigint as c from ft_set group by 1 order by 2 desc limit 40`);
  out.sets = Object.fromEntries(sets.rows.map((r) => [String(r.k).replace(/\d{5,}/g, "#"), Number(r.c)]));
  const lists = await db.query(`select split_part(k, ':', 1) as p, count(*)::bigint as c from ft_list group by 1 order by 2 desc limit 40`);
  out.listsByPrefix = Object.fromEntries(lists.rows.map((r) => [String(r.p), Number(r.c)]));
  const z = await db.query(`select split_part(k, ':', 1) as p, count(*)::bigint as c, coalesce(sum(score),0)::bigint as s from ft_zset group by 1 order by 2 desc limit 40`);
  out.zsetsByPrefix = Object.fromEntries(z.rows.map((r) => [String(r.p), { members: Number(r.c), scoreSum: Number(r.s) }]));
  return out;
}

export async function currentCounts() {
  return countsOf(await getPool());
}

/** تصدير كامل (كل صفوف كل الجداول) — للحفظ كملف JSON عند المالك */
export async function exportAll(which: "current" | "old" = "current") {
  const url = which === "old" ? oldDatabaseUrl() : postgresUrl();
  if (!url) throw new Error(which === "old" ? "OLD_DATABASE_URL غير مضبوط" : "DATABASE_URL غير مضبوط");
  const pool = which === "old" ? await openPool(url) : await getPool();
  try {
    const dump: Record<string, unknown> = {
      format: "ft-bot-backup-v1",
      at: new Date().toISOString(),
      source: describeUrl(url),
    };
    const tables: Record<string, Row[]> = {};
    for (const table of TABLES) {
      if (!(await tableExists(pool, table))) continue;
      const order = table === "ft_list" || table === "ft_ledger" ? "id" : "k";
      const column = table === "ft_ledger" ? "id" : order;
      tables[table] = (await pool.query(`select * from ${table} order by ${column}`)).rows;
    }
    dump.counts = await countsOf(pool);
    dump.tables = tables;
    return dump;
  } finally {
    if (which === "old") await pool.end().catch(() => undefined);
  }
}

const isStamp = (n: number) => Math.abs(n) > 1e11;
function numeric(v: unknown, n: unknown): number | null {
  if (v === null || v === undefined) return Number(n ?? 0);
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return null;
}
const isLease = (v: unknown) =>
  Boolean(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 1 && "token" in (v as object));

export type ImportReport = {
  dryRun: boolean;
  source: ReturnType<typeof describeUrl>;
  target: ReturnType<typeof describeUrl>;
  before: Record<string, unknown>;
  old: Record<string, unknown>;
  after: Record<string, unknown>;
  actions: Record<string, number>;
};

/**
 * دمج القاعدة القديمة (OLD_DATABASE_URL) في الحالية (DATABASE_URL).
 * dryRun = كل شيء داخل معاملة ثم ROLLBACK: الأعداد «بعد» حقيقية ولا شيء يُكتب.
 */
export async function importOldDatabase(options: { dryRun: boolean }): Promise<ImportReport> {
  const oldUrl = oldDatabaseUrl();
  const newUrl = postgresUrl();
  if (!oldUrl) throw new Error("OLD_DATABASE_URL غير مضبوط");
  if (!newUrl) throw new Error("DATABASE_URL غير مضبوط");
  const src = sourceFingerprint(oldUrl);
  if (src === sourceFingerprint(newUrl)) throw new Error("القديمة والحالية نفس القاعدة — لا شيء للدمج");

  const oldPool = await openPool(oldUrl);
  const pool = await getPool(); // يضمن تطبيق الترحيلات على القاعدة الحالية
  const client = await pool.connect();
  const actions: Record<string, number> = {};
  const bump = (name: string, by = 1) => {
    actions[name] = (actions[name] || 0) + by;
  };
  try {
    const old = await countsOf(oldPool);
    const before = await countsOf(pool);
    const read = async (table: string, order: string) =>
      (await tableExists(oldPool, table)) ? (await oldPool.query(`select * from ${table} order by ${order}`)).rows as Row[] : [];
    const [kv, sets, zsets, lists, ledger] = await Promise.all([
      read("ft_kv", "k"),
      read("ft_set", "k, m"),
      read("ft_zset", "k, m"),
      read("ft_list", "id"),
      read("ft_ledger", "id"),
    ]);

    await client.query("begin");
    await client.query(`
      create table if not exists ft_import_log (
        src text not null, tbl text not null, k text not null, m text not null default '',
        at timestamptz not null default now(),
        primary key (src, tbl, k, m)
      );
      create table if not exists ft_import_conflicts (
        src text not null, k text not null, kept jsonb, kept_n bigint, replaced jsonb, replaced_n bigint,
        at timestamptz not null default now(),
        primary key (src, k)
      );
    `);
    /** علامة «طُبّق مرة»: true فقط أول مرة */
    const once = async (tbl: string, k: string, m = "") =>
      (await client.query("insert into ft_import_log (src, tbl, k, m) values ($1,$2,$3,$4) on conflict do nothing returning 1", [src, tbl, k, m])).rowCount === 1;

    // ── ft_set: اتحاد
    for (let i = 0; i < sets.length; i += 500) {
      const part = sets.slice(i, i + 500).filter((r) => !SKIP_KEY.test(String(r.k)));
      const res = await client.query(
        "insert into ft_set (k, m) select * from unnest($1::text[], $2::text[]) on conflict do nothing",
        [part.map((r) => String(r.k)), part.map((r) => String(r.m))],
      );
      bump("set.added", res.rowCount || 0);
    }

    // ── ft_zset
    for (const r of zsets) {
      const k = String(r.k), m = String(r.m), score = Number(r.score) || 0;
      if (SKIP_KEY.test(k)) continue;
      const ins = await client.query("insert into ft_zset (k, m, score) values ($1,$2,$3) on conflict do nothing", [k, m, score]);
      if (ins.rowCount === 1) {
        await once("ft_zset", k, m);
        bump("zset.added");
      } else if (await once("ft_zset", k, m)) {
        await client.query("update ft_zset set score = score + $3 where k = $1 and m = $2", [k, m, score]);
        bump("zset.summed");
      } else bump("zset.already");
    }

    // ── ft_list / ft_ledger: معرّفات سالبة = قبل الجديدة، بنفس الترتيب، وبلا تكرار
    const maxListId = lists.reduce((mx, r) => Math.max(mx, Number(r.id)), 0);
    for (let i = 0; i < lists.length; i += 500) {
      const part = lists.slice(i, i + 500).filter((r) => !SKIP_KEY.test(String(r.k)));
      const res = await client.query(
        "insert into ft_list (id, k, v) select * from unnest($1::bigint[], $2::text[], $3::text[]) on conflict (id) do nothing",
        [part.map((r) => String(Number(r.id) - maxListId - 1)), part.map((r) => String(r.k)), part.map((r) => String(r.v))],
      );
      bump("list.added", res.rowCount || 0);
    }
    const maxLedgerId = ledger.reduce((mx, r) => Math.max(mx, Number(r.id)), 0);
    for (const r of ledger) {
      const res = await client.query(
        `insert into ft_ledger (id, at, kind, user_id, delta, balance, ref, meta) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)
         on conflict (id) do nothing`,
        [String(Number(r.id) - maxLedgerId - 1), r.at, r.kind, r.user_id, r.delta, r.balance, r.ref ?? "", r.meta == null ? null : JSON.stringify(r.meta)],
      );
      bump("ledger.added", res.rowCount || 0);
    }

    // ── ft_kv
    for (const r of kv) {
      const k = String(r.k);
      if (SKIP_KEY.test(k) || isLease(r.v)) {
        bump("kv.skippedOperational");
        continue;
      }
      const oldV = r.v ?? null;
      const oldN = String(r.n ?? 0);
      const json = oldV === null ? null : JSON.stringify(oldV);
      const ins = await client.query("insert into ft_kv (k, v, n) values ($1, $2::jsonb, $3::bigint) on conflict (k) do nothing", [k, json, oldN]);
      if (ins.rowCount === 1) {
        await once("ft_kv", k);
        bump("kv.added");
        continue;
      }
      if (!(await once("ft_kv", k))) {
        bump("kv.already");
        continue;
      }
      const cur = (await client.query("select v, n from ft_kv where k = $1 for update", [k])).rows[0];
      const a = numeric(oldV, r.n);
      const b = numeric(cur.v ?? null, cur.n);
      if (a !== null && b !== null) {
        if (isStamp(a) || isStamp(b)) {
          // طابع زمني (علامة «محسوب»): نحتفظ بالأقدم
          const keep = Math.min(a, b);
          if (cur.v === null || cur.v === undefined) await client.query("update ft_kv set n = $2::bigint where k = $1", [k, String(keep)]);
          else await client.query("update ft_kv set v = $2::jsonb where k = $1", [k, JSON.stringify(keep)]);
          bump("kv.stampKeptOldest");
        } else {
          const sum = a + b;
          if (cur.v === null || cur.v === undefined) await client.query("update ft_kv set n = $2::bigint where k = $1", [k, String(Math.trunc(sum))]);
          else await client.query("update ft_kv set v = $2::jsonb, n = 0 where k = $1", [k, JSON.stringify(sum)]);
          bump("kv.numbersSummed");
        }
        continue;
      }
      if (JSON.stringify(cur.v ?? null) === JSON.stringify(oldV) ) {
        bump("kv.identical");
        continue;
      }
      // قيمتان مختلفتان غير رقميتين: القديمة تفوز، والحالية تُحفظ للمراجعة
      await client.query(
        `insert into ft_import_conflicts (src, k, kept, kept_n, replaced, replaced_n) values ($1,$2,$3::jsonb,$4::bigint,$5::jsonb,$6::bigint)
         on conflict (src, k) do nothing`,
        [src, k, json, oldN, cur.v == null ? null : JSON.stringify(cur.v), String(cur.n ?? 0)],
      );
      await client.query("update ft_kv set v = $2::jsonb, n = $3::bigint where k = $1", [k, json, oldN]);
      bump("kv.conflictOldKept");
    }

    const after = await countsOf(client);
    await client.query(options.dryRun ? "rollback" : "commit");
    return { dryRun: options.dryRun, source: describeUrl(oldUrl), target: describeUrl(newUrl), before, old, after, actions };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await oldPool.end().catch(() => undefined);
  }
}
