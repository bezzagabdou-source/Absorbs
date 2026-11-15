#!/usr/bin/env node
/**
 * Copy the FT bot's Redis-compatible Postgres tables from OLD_DATABASE_URL to
 * DATABASE_URL without changing the source or overwriting existing target keys.
 * Defaults to a read-only preview; pass --apply only after checking the report.
 */
import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const APPLY = process.argv.includes("--apply");
const SOURCE_URL = process.env.OLD_DATABASE_URL || "";
const TARGET_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
const TABLES = ["ft_kv", "ft_set", "ft_zset", "ft_list", "ft_agent_versions"];
const safeUrl = (raw) => {
  try { const u = new URL(raw); return `${u.hostname.toLowerCase()}:${u.port || "5432"}/${u.pathname.replace(/^\//, "")}`; }
  catch { return ""; }
};
const countRows = async (client, table) => {
  const exists = await client.query("select to_regclass($1) as name", [`public.${table}`]);
  if (!exists.rows[0]?.name) return 0;
  const result = await client.query(`select count(*)::bigint as count from ${table}`);
  return Number(result.rows[0].count) || 0;
};
const log = (text) => console.log(text);

if (!SOURCE_URL || !TARGET_URL) {
  console.error("Set OLD_DATABASE_URL (source) and DATABASE_URL (target). Connection values are never printed.");
  process.exit(2);
}
if (!safeUrl(SOURCE_URL) || safeUrl(SOURCE_URL) === safeUrl(TARGET_URL)) {
  console.error("Source and target must be valid, different Postgres databases.");
  process.exit(2);
}

const poolOpts = (connectionString) => ({
  connectionString,
  max: 1,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) || /sslmode=disable/.test(connectionString)
    ? undefined : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});
const source = new Pool(poolOpts(SOURCE_URL));
const target = new Pool(poolOpts(TARGET_URL));
let src, dst;
try {
  src = await source.connect();
  dst = await target.connect();
  await src.query("begin isolation level repeatable read read only");
  const report = {};
  for (const table of TABLES) report[table] = { source: await countRows(src, table), target: await countRows(dst, table), added: 0, existing: 0 };
  log(`${APPLY ? "APPLY" : "DRY RUN"}: FT bot Postgres migration`);
  for (const [table, row] of Object.entries(report)) log(`  ${table}: source ${row.source}, target before ${row.target}`);
  if (!APPLY) {
    log("No data was written. Review the counts, then rerun with --apply to merge without overwriting target keys.");
    await src.query("rollback");
  } else {
    await dst.query("begin");
    try {
      await dst.query(`
        create table if not exists ft_kv (k text primary key, v jsonb, n bigint not null default 0);
        create table if not exists ft_set (k text not null, m text not null, primary key (k, m));
        create table if not exists ft_zset (k text not null, m text not null, score double precision not null default 0, primary key (k, m));
        create table if not exists ft_list (id bigserial primary key, k text not null, v text not null);
        create index if not exists ft_list_k_idx on ft_list (k, id);
        create table if not exists ft_agent_versions (id text primary key, snapshot text not null, undone boolean not null default false, created_at timestamptz not null default now());
        create table if not exists ft_imported_list_rows (fingerprint text primary key, imported_at timestamptz not null default now());
      `);
      for (const table of ["ft_kv", "ft_set", "ft_zset", "ft_agent_versions"]) {
        if (!report[table].source) continue;
        const exists = await src.query("select to_regclass($1) as name", [`public.${table}`]);
        if (!exists.rows[0]?.name) continue;
        const { rows } = await src.query(`select * from ${table}`);
        const specs = {
          ft_kv: { columns: ["k", "v", "n"], conflict: "(k) do nothing", values: r => [r.k, r.v, r.n] },
          ft_set: { columns: ["k", "m"], conflict: "(k, m) do nothing", values: r => [r.k, r.m] },
          ft_zset: { columns: ["k", "m", "score"], conflict: "(k, m) do nothing", values: r => [r.k, r.m, r.score] },
          ft_agent_versions: { columns: ["id", "snapshot", "undone", "created_at"], conflict: "(id) do nothing", values: r => [r.id, r.snapshot, r.undone, r.created_at] },
        }[table];
        for (const r of rows) {
          const values = specs.values(r);
          const params = values.map((_, i) => `$${i + 1}`).join(", ");
          const result = await dst.query(`insert into ${table} (${specs.columns.join(", ")}) values (${params}) on conflict ${specs.conflict} returning 1`, values);
          if (result.rowCount) report[table].added++;
          else report[table].existing++;
        }
      }
      if (report.ft_list.source) {
        const exists = await src.query("select to_regclass('public.ft_list') as name");
        if (exists.rows[0]?.name) {
          const { rows } = await src.query("select id, k, v from ft_list order by id asc");
          for (const r of rows) {
            const fingerprint = crypto.createHash("sha256").update(`${r.id}\0${r.k}\0${r.v}`).digest("hex");
            const inserted = await dst.query("insert into ft_imported_list_rows (fingerprint) values ($1) on conflict do nothing returning fingerprint", [fingerprint]);
            if (!inserted.rowCount) { report.ft_list.existing++; continue; }
            await dst.query("insert into ft_list (k, v) values ($1, $2)", [r.k, r.v]);
            report.ft_list.added++;
          }
        }
      }
      await dst.query("select setval(pg_get_serial_sequence('ft_list','id'), greatest(coalesce((select max(id) from ft_list), 1), 1), (select max(id) is not null from ft_list))");
      await dst.query("commit");
      await src.query("rollback");
      for (const [table, row] of Object.entries(report)) log(`  ${table}: added ${row.added}, already present ${row.existing}`);
      log("Migration committed. The source database was read-only and unchanged.");
    } catch (error) {
      await dst.query("rollback").catch(() => {});
      throw error;
    }
  }
} catch (error) {
  await src?.query("rollback").catch(() => {});
  console.error(`Migration failed (${error?.code || error?.name || "error"}). No source data was modified; verify both database services and retry.`);
  process.exitCode = 1;
} finally {
  src?.release(); dst?.release();
  await source.end(); await target.end();
}
