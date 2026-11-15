/**
 * اختبار كامل لعطل القاعدة: Postgres حقيقي (PGlite عبر TCP) + Redis (fakeredis).
 *
 *   cd ft-contest-bot
 *   npm i --no-save tsx @electric-sql/pglite @electric-sql/pglite-socket
 *   python3 -m venv /tmp/fr && /tmp/fr/bin/pip install fakeredis
 *   FAKEREDIS_PY=/tmp/fr/bin/python npx tsx test/resilience/outage.e2e.ts
 */
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PG_PORT = 5544;
const REDIS_PORT = 6390;
process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres?sslmode=disable`;
process.env.REDIS_URL = `redis://127.0.0.1:${REDIS_PORT}`;
process.env.PG_POOL_MAX = "1";
process.env.STORE_BREAKER_MS = "300";

let fail = 0;
const check = (label: string, ok: boolean, extra: unknown = "") => {
  if (!ok) fail += 1;
  console.log(ok ? "  ✅" : "  ❌", label, ok ? "" : JSON.stringify(extra));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function resetProcessState() {
  // محاكاة cold start: كل ما في ذاكرة العملية يضيع
  const g = globalThis as Record<string, unknown>;
  for (const key of Object.keys(g)) if (key.startsWith("__ft")) delete g[key];
}

async function main() {
  const py = process.env.FAKEREDIS_PY || "python3";
  const redis = spawn(py, ["-c", `from fakeredis import TcpFakeServer\ns=TcpFakeServer(("127.0.0.1",${REDIS_PORT}),server_type="redis")\ns.serve_forever()`], { stdio: "inherit" });
  const db = await PGlite.create();
  let server = new PGLiteSocketServer({ db, port: PG_PORT, host: "127.0.0.1" });
  await server.start();
  await sleep(1200);

  const storeMod = await import("../../src/lib/store");
  const resMod = await import("../../src/lib/storeResilience");
  let store = storeMod.getStore();

  console.log("1) بيانات «الصباح» في القاعدة الأساسية");
  await store.set("user:1", { id: "1", name: "قديم", points: 100 });
  await store.sAdd("users:ids", "1");
  await store.incr("stats:starts", 40);
  await store.zIncr("lb", "1", 7);
  await store.listPush("log", ["a"]);
  await store.set("settings", { requireJoin: true, channels: ["@mxabdou"] });
  check("القراءة من Postgres", (await store.get<{ points: number }>("user:1"))?.points === 100);

  console.log("2) العطل: Postgres يسقط");
  await server.stop();
  await storeMod.recyclePool();
  const during = await store.get("user:1");
  check("القراءة وقت العطل لا ترمي", during === null, during);
  await store.set("user:1", { id: "1", name: "قديم", points: 0 }); // ⚠️ الكتابة الخطيرة
  await store.set("user:2", { id: "2", name: "جديد", points: 0 });
  await store.set("user:2", { id: "2", name: "جديد", points: 5 });
  await store.sAdd("users:ids", "2");
  await store.incr("stats:starts", 2);
  await store.zIncr("lb", "2", 3);
  await store.listPush("log", ["b"]);
  await store.del("settings");
  check("الاحتياط دائم (redis)", resMod.degradationInfo().fallback === "redis", resMod.degradationInfo());
  check("القراءة من الاحتياط", (await store.get<{ points: number }>("user:2"))?.points === 5);
  const journaled = await resMod.journalLength();
  check("السجلّ فيه الكتابات الثماني (+ سجل الأخطاء)", journaled >= 8, journaled);

  console.log("3) cold start وقت العطل: لا شيء يضيع");
  resetProcessState();
  store = storeMod.getStore();
  check("مستخدم العطل ما زال موجوداً", (await store.get<{ points: number }>("user:2"))?.points === 5);
  check("السجلّ لم ينقص بعد cold start", (await resMod.journalLength()) >= journaled, await resMod.journalLength());

  console.log("4) رجوع القاعدة + إعادة السجلّ");
  server = new PGLiteSocketServer({ db, port: PG_PORT, host: "127.0.0.1" });
  await server.start();
  await storeMod.recyclePool();
  await sleep(500);
  await store.get("user:1");
  await sleep(300);
  const flushed = await storeMod.retryPendingWrites();
  await sleep(300);
  const again = await storeMod.retryPendingWrites();
  check("السجلّ فارغ", again.pending === 0, { flushed, again });
  check("⭐ نقاط المستخدم القديم لم تُمسح (100)", (await store.get<{ points: number }>("user:1"))?.points === 100, await store.get("user:1"));
  check("المستخدم الجديد وصل بآخر قيمة (5)", (await store.get<{ points: number }>("user:2"))?.points === 5, await store.get("user:2"));
  check("المجموعة = اتحاد (2)", (await store.sCard("users:ids")) === 2);
  check("العدّاد = 42", Number(await store.get("stats:starts")) === 42, await store.get("stats:starts"));
  check("الترتيب: القديم 7 والجديد 3", (await store.zScore("lb", "1")) === 7 && (await store.zScore("lb", "2")) === 3);
  check("القائمة = 2", (await store.listLen("log")) === 2);
  check("⭐ الإعدادات لم تُحذف", (await store.get<{ requireJoin: boolean }>("settings"))?.requireJoin === true);
  const conflicts = await store.listAll(resMod.CONFLICTS_KEY, 50);
  const keys = conflicts.map((line) => { const row = JSON.parse(line); return `${row.op} ${row.args[0]}`; }).sort();
  check("تعارضان محفوظان للمراجعة (set user:1 + del settings)", JSON.stringify(keys) === JSON.stringify(["del settings", "set user:1"]), keys);

  console.log("5) الإعادة مرة ثانية لا تضاعف شيئاً");
  await storeMod.retryPendingWrites();
  check("العدّاد ما زال 42", Number(await store.get("stats:starts")) === 42);
  check("القائمة ما زالت 2", (await store.listLen("log")) === 2);

  await server.stop();
  redis.kill();
  console.log(fail ? `\n❌ ${fail} فشل` : "\n✅ كل الفحوص ناجحة");
  process.exit(fail ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
