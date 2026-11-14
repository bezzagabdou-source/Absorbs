import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

// جذر المشروع (شغّل من ft-contest-bot/) — ملف مؤقّت للمخطط المترجم
const ROOT = process.cwd();
const OUT = `${ROOT}/.schema-compiled.mjs`;

const src = readFileSync(ROOT + "/src/db/schema.ts", "utf8");
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(OUT, js);
const { MIGRATIONS } = await import(OUT + "?" + Date.now());

const db = new PGlite();
let fail = 0;
console.log("migrations:", MIGRATIONS.map((m) => m.id).join(", "));
// 1) apply in order (like ensureSchema: 0001 + 0003 first, then the rest)
for (const m of MIGRATIONS) {
  try { await db.exec(m.sql); console.log("  ✅ applied", m.id); }
  catch (e) { fail++; console.log("  ❌ failed", m.id, String(e.message).slice(0, 300)); }
}
// 2) idempotency: apply everything a second time
for (const m of MIGRATIONS) {
  try { await db.exec(m.sql); }
  catch (e) { fail++; console.log("  ❌ not idempotent:", m.id, String(e.message).slice(0, 300)); }
}
console.log("  ✅ idempotent re-apply", fail === 0 ? "ok" : "see errors");

// 3) required tables + indices
const tables = (await db.query("select tablename from pg_tables where schemaname='public' order by 1")).rows.map((r) => r.tablename);
console.log("tables:", tables.join(", "));
const idx = (await db.query("select indexname from pg_indexes where schemaname='public' order by 1")).rows.map((r) => r.indexname);
console.log("indices:", idx.join(", "));

// 4) functional smoke over the KV semantics the Store relies on
await db.exec(`insert into ft_kv (k, v) values ('a', '{"x":1}'::jsonb) on conflict (k) do update set v = excluded.v`);
await db.exec(`insert into ft_kv (k, n) values ('c', 5) on conflict (k) do update set n = ft_kv.n + excluded.n`);
const r1 = await db.query("select v, n from ft_kv where k = any($1::text[])", [["a", "c", "missing"]]);
console.log("kv rows:", JSON.stringify(r1.rows));
await db.exec(`insert into ft_kv (k, v, n) values ('lease','{"token":"t"}'::jsonb, 9999999999999) on conflict (k) do update set v = excluded.v, n = excluded.n where ft_kv.n <= 0 or ft_kv.v ->> 'token' = 't2' returning k`);
const lease = await db.query("select count(*)::int c from ft_kv where k='lease'").catch(() => null);
console.log("lease take:", JSON.stringify((await db.query("select k from ft_kv where k='lease'")).rows));

const checks = [];
const has = (n) => tables.includes(n);
checks.push(["ft_kv", has("ft_kv")], ["ft_set", has("ft_set")], ["ft_zset", has("ft_zset")], ["ft_list", has("ft_list")], ["ft_migrations", has("ft_migrations")], ["ft_ledger", has("ft_ledger")], ["ft_agent_versions", has("ft_agent_versions")], ["ft_update_seen", has("ft_update_seen")]);
checks.push(["hot indices", idx.length >= 3]);
for (const [n, ok] of checks) { if (!ok) fail++; console.log(ok ? "  ✅" : "  ❌", n); }

// 5) transaction rollback works
await db.exec("create table if not exists t_tx (v int)");
try {
  await db.transaction(async (tx) => { await tx.query("insert into t_tx values (1)"); throw new Error("boom"); });
} catch { /* expected */ }
const txRows = (await db.query("select count(*)::int c from t_tx")).rows[0].c;
console.log(txRows === 0 ? "  ✅ rollback صحيح" : "  ❌ rollback فاشل");
if (txRows !== 0) fail++;

console.log(fail ? `\n❌ ${fail} فشل` : "\n✅ كل اختبارات المخطط ناجحة");
process.exit(fail ? 1 : 0);
