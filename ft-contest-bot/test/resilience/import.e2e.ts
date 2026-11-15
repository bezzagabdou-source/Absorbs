/**
 * اختبار دمج القاعدة القديمة في الجديدة (قاعدتا Postgres حقيقيتان عبر PGlite).
 *   npx tsx test/resilience/import.e2e.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const OLD = 5546, NEW = 5547;
process.env.PG_POOL_MAX = "2";
process.env.STORE_BREAKER_MS = "300";
const url = (port: number) => `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;

let fail = 0;
const check = (label: string, ok: boolean, extra: unknown = "") => {
  if (!ok) fail += 1;
  console.log(ok ? "  ✅" : "  ❌", label, ok ? "" : JSON.stringify(extra));
};
const resetState = () => {
  const g = globalThis as Record<string, unknown>;
  for (const key of Object.keys(g)) if (key.startsWith("__ft")) delete g[key];
};

async function main() {
  const servers = [];
  for (const port of [OLD, NEW]) {
    const server = new PGLiteSocketServer({ db: await PGlite.create(), port, host: "127.0.0.1", maxConnections: 5 } as never);
    await server.start();
    servers.push(server);
  }
  const storeMod = await import("../../src/lib/store");
  const backup = await import("../../src/lib/dbBackup");

  console.log("1) القاعدة القديمة (بيانات الصباح)");
  process.env.DATABASE_URL = url(OLD);
  let store = storeMod.getStore();
  await store.sAdd("users:ids", "1");
  await store.sAdd("users:ids", "2");
  await store.set("user:1", { id: "1", name: "قديم" });
  await store.set("user:2", { id: "2", name: "ثاني" });
  await store.set("pts:1", 100);
  await store.set("pts:2", 50);
  await store.incr("refs:joined:1", 5);
  await store.set("refbtot:c1:2", 1794000000000);
  await store.set("settings", { requireJoin: true, channels: ["@mxabdou"], welcome: "الأصل" });
  await store.zIncr("points:top", "1", 9);
  await store.listPush("rreq:list", ["r1", "r2"]);
  await store.sAdd("contests:ids", "c1");
  await store.set("rreq:r1", { id: "r1", uid: "1" });
  const oldCounts = await backup.currentCounts();
  check("أعداد القديمة: 2 مستخدم / 150 نقطة / 5 إحالات", oldCounts.users === 2 && oldCounts.pointsTotal === 150 && oldCounts.referralsTotal === 5, oldCounts);
  await storeMod.recyclePool();

  console.log("2) القاعدة الجديدة (مستخدمون دخلوا بعد العطل)");
  resetState();
  process.env.DATABASE_URL = url(NEW);
  process.env.OLD_DATABASE_URL = url(OLD);
  store = storeMod.getStore();
  await store.sAdd("users:ids", "2");
  await store.sAdd("users:ids", "3");
  await store.set("user:1", { id: "1", name: "قديم-معدّل" });
  await store.set("user:3", { id: "3", name: "جديد" });
  await store.set("pts:1", 10);
  await store.set("pts:3", 7);
  await store.incr("refs:joined:1", 1);
  await store.set("refbtot:c1:2", 1794999999999);
  await store.set("settings", { requireJoin: true, channels: ["@mxabdou"], welcome: "افتراضي" });
  await store.zIncr("points:top", "1", 1);
  await store.zIncr("points:top", "3", 2);
  await store.listPush("rreq:list", ["r3"]);

  console.log("3) معاينة (dry-run): لا شيء يُكتب");
  const dry = await backup.importOldDatabase({ dryRun: true });
  check("المعاينة تُظهر 3 مستخدمين بعد الدمج", dry.after.users === 3, dry.after);
  check("القاعدة لم تتغيّر فعلاً", (await backup.currentCounts()).users === 2);

  console.log("4) تنفيذ الدمج");
  const done = await backup.importOldDatabase({ dryRun: false });
  console.log("   actions:", JSON.stringify(done.actions));
  check("المستخدمون = 3 (لا أحد ضاع)", done.after.users === 3, done.after);
  check("النقاط = 167 (100+10, 50, 7)", done.after.pointsTotal === 167, done.after.pointsTotal);
  check("pts:1 = 110", Number(await store.get("pts:1")) === 110, await store.get("pts:1"));
  check("الإحالات = 6", Number(await store.get("refs:joined:1")) === 6, await store.get("refs:joined:1"));
  check("علامة refbtot = الأقدم", Number(await store.get("refbtot:c1:2")) === 1794000000000);
  check("الإعدادات = الأصلية", (await store.get<{ welcome: string }>("settings"))?.welcome === "الأصل");
  check("الترتيب: 1 → 10، 3 → 2", (await store.zScore("points:top", "1")) === 10 && (await store.zScore("points:top", "3")) === 2);
  check("القائمة: القديم أولاً ثم الجديد", JSON.stringify(await store.listAll("rreq:list", 10)) === JSON.stringify(["r1", "r2", "r3"]), await store.listAll("rreq:list", 10));
  check("المسابقات = 1 والطلبات = 1", done.after.contests === 1 && done.after.rewardRequests === 1, done.after);
  const pool = await storeMod.getPool();
  const conflicts = (await pool.query("select k from ft_import_conflicts order by k")).rows.map((r: { k: string }) => r.k);
  check("القيم المستبدلة محفوظة (settings, user:1)", JSON.stringify(conflicts) === JSON.stringify(["settings", "user:1"]), conflicts);

  console.log("5) إعادة التنفيذ = لا عدّ مزدوج");
  const again = await backup.importOldDatabase({ dryRun: false });
  check("النقاط ما زالت 167", again.after.pointsTotal === 167, again.after.pointsTotal);
  check("الإحالات ما زالت 6", Number(await store.get("refs:joined:1")) === 6);
  check("الترتيب ما زال 10", (await store.zScore("points:top", "1")) === 10);
  check("القائمة ما زالت 3", (await store.listLen("rreq:list")) === 3);
  check("لا إضافات جديدة", !again.actions["kv.added"] && !again.actions["zset.summed"] && !again.actions["kv.numbersSummed"], again.actions);

  for (const server of servers) await server.stop();
  console.log(fail ? `\n❌ ${fail} فشل` : "\n✅ كل الفحوص ناجحة");
  process.exit(fail ? 1 : 0);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
