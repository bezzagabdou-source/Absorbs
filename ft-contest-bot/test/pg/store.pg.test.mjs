import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";

// جذر المشروع (شغّل من ft-contest-bot/) — ملف مؤقّت للمخطط المترجم
const ROOT = process.cwd();
const OUT = `${ROOT}/.schema-compiled.mjs`;
const pglite = new PGlite();
const schemaJs = ts.transpileModule(readFileSync(ROOT + "/src/db/schema.ts","utf8"), { compilerOptions:{ module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
writeFileSync(OUT, schemaJs);
const { MIGRATIONS } = await import(OUT + "?" + Date.now());
for (const m of MIGRATIONS) await pglite.exec(m.sql);

// نحاكيو عمليات PostgresStore بنفس SQL اللي في الملف
const SET = `insert into ft_kv (k, v, n) values ($1, $2::jsonb, 0) on conflict (k) do update set v = excluded.v, n = 0`;
const GET = `select v, n from ft_kv where k = $1`;
const INCR = `insert into ft_kv (k, n, v) values ($1, $2::bigint, null)
   on conflict (k) do update
     set n = coalesce(nullif(ft_kv.v #>> '{}', '')::bigint, ft_kv.n, 0) + excluded.n,
         v = null
   returning n`;

const get = async (k) => { const { rows } = await pglite.query(GET, [k]); if (!rows.length) return null; const r = rows[0]; return r.v !== null && r.v !== undefined ? r.v : (r.n ?? null); };
let fail = 0; const check = (l, c, extra="") => { c ? (console.log("  ✅", l)) : (fail++, console.log("  ❌", l, extra)); };

console.log("1) set → get");
await pglite.query(SET, ["a", JSON.stringify({x:1})]);
check("قراءة JSON", JSON.stringify(await get("a")) === '{"x":1}');

console.log("2) incr على مفتاح جديد");
let r = await pglite.query(INCR, ["c", 5]);
check("= 5", Number(r.rows[0].n) === 5, JSON.stringify(r.rows));
check("get = 5", (await get("c")) === 5, String(await get("c")));

console.log("3) incr ثم incr");
r = await pglite.query(INCR, ["c", 3]);
check("= 8", Number(r.rows[0].n) === 8, JSON.stringify(r.rows));

console.log("4) set بعد incr (تصفير العدّاد)");
await pglite.query(SET, ["c", JSON.stringify(42)]);
check("get = 42", (await get("c")) === 42, String(await get("c")));

console.log("5) incr بعد set (كان كيرجع قيمة غالطة قبل الإصلاح)");
r = await pglite.query(INCR, ["c", 1]);
check("= 43", Number(r.rows[0].n) === 43, JSON.stringify(r.rows));
check("get = 43", (await get("c")) === 43, String(await get("c")));

console.log("6) incr بمقدار 0 (قراءة) — ما كتكتبش قيمة غالطة");
r = await pglite.query(INCR, ["c", 0]);
check("= 43", Number(r.rows[0].n) === 43, JSON.stringify(r.rows));

console.log("7) set/incr على مفاتيح مختلفة + getMany");
await pglite.query(SET, ["d", JSON.stringify("text")]);
const many = await pglite.query("select k, v, n from ft_kv where k = any($1::text[])", [["a","c","d","zz"]]);
check("3 صفوف موجودة", many.rows.length === 3, JSON.stringify(many.rows.length));

console.log("8) zset: zIncr + zTop + zScore");
await pglite.query(`insert into ft_zset (k,m,score) values ($1,$2,$3) on conflict (k,m) do update set score = ft_zset.score + excluded.score returning score`, ["top","u1",5]);
await pglite.query(`insert into ft_zset (k,m,score) values ($1,$2,$3) on conflict (k,m) do update set score = ft_zset.score + excluded.score returning score`, ["top","u2",9]);
const top = await pglite.query(`select m, score from ft_zset where k=$1 order by score desc, m asc limit $2`, ["top", 10]);
check("الترتيب صحيح", top.rows[0].m === "u2" && Number(top.rows[1].score) === 5, JSON.stringify(top.rows));

console.log("9) list: listPush بـ batch + listAll + listRecent + listPop");
await pglite.query(`insert into ft_list (k, v) select $1, value from jsonb_array_elements_text($2::jsonb) with ordinality as t(value, ord) order by ord`, ["L", JSON.stringify(["a","b","c"])]);
const all = await pglite.query(`select v from ft_list where k=$1 order by id asc limit $2`, ["L", 10]);
check("3 عناصر بالترتيب", all.rows.map(x=>x.v).join(",") === "a,b,c", JSON.stringify(all.rows));
const rec = await pglite.query(`select v from ft_list where k=$1 order by id desc limit $2`, ["L", 2]);
check("listRecent يرجع الأحدث أولاً", rec.rows.map(x=>x.v).join(",") === "c,b", JSON.stringify(rec.rows));
const pop = await pglite.query(`delete from ft_list where id = (select id from ft_list where k = $1 order by id asc limit 1) returning v`, ["L"]);
check("listPop = a", pop.rows[0]?.v === "a", JSON.stringify(pop.rows));

console.log("10) lease (قفل) — منع التداخل");
const LEASE = `insert into ft_kv (k, v, n) values ($1, $2::jsonb, $3)
   on conflict (k) do update set v = excluded.v, n = excluded.n
   where ft_kv.n <= $4 or ft_kv.v ->> 'token' = $5
   returning k`;
const now = Date.now();
const l1 = await pglite.query(LEASE, ["lock:x", JSON.stringify({token:"A"}), now+15000, now, "B"]);
const l2 = await pglite.query(LEASE, ["lock:x", JSON.stringify({token:"B"}), now+15000, now, "B"]);
check("أول قفل نجح", l1.rows.length === 1);
check("ثاني قفل مترفض", l2.rows.length === 0);
const l3 = await pglite.query(LEASE, ["lock:x", JSON.stringify({token:"B"}), now+15000, now, "A"]);
check("نفس المالك كيقدر يعاود", l3.rows.length === 1);
const REL = `delete from ft_kv where k = $1 and v ->> 'token' = $2`;
await pglite.query(REL, ["lock:x","B"]);
const l4 = await pglite.query(LEASE, ["lock:x", JSON.stringify({token:"C"}), now+15000, now, "C"]);
check("بعد الإطلاق قفل جديد كيدخل", l4.rows.length === 1);

console.log(fail ? `\n❌ ${fail} فشل` : "\n✅ كل عمليات المخزن على Postgres صحيحة");
process.exit(fail ? 1 : 0);
