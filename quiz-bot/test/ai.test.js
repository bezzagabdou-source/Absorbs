import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dbPath = path.join(os.tmpdir(), `barq-ai-${process.pid}.db`);
for (const f of [dbPath, dbPath + "-wal", dbPath + "-shm"]) {
  try { fs.unlinkSync(f); } catch {}
}
process.env.DB_PATH = dbPath;
process.env.DEMO = "1";
process.env.DASHBOARD_PASSWORD = "initial-pass-123";
process.env.SESSION_SECRET = "y".repeat(40);
process.env.OPENROUTER_API_KEY = "sk-or-v1-test-key-for-tests";
process.env.AI_BASE_OPENROUTER = "http://127.0.0.1:9922/v1";
process.env.BOT_USERNAME = "barq_test_bot";

const { seedSettings } = await import("../src/db.js");
const { upsertUser } = await import("../src/services/users.js");
const { startMockAI } = await import("../scripts/mock-ai.js");
const { shield } = await import("../src/ai/shield.js");
const { runTool, TOOLS } = await import("../src/ai/tools.js");
const { chat } = await import("../src/ai/brain.js");
const { saveUpload, sniffImage, listUploads } = await import("../src/services/uploads.js");
const passwords = await import("../src/services/passwords.js");
const { changePassword } = await import("../src/services/auth.js");

seedSettings();
const mock = await startMockAI({ port: 9922 });

function mkUser(id, extra = {}) {
  return upsertUser({
    id,
    is_bot: false,
    first_name: extra.first_name ?? "تجربة",
    last_name: extra.last_name ?? null,
    username: extra.username ?? `user${id}`,
    language_code: "ar",
  }, { ip: extra.ip }).user;
}

/* ───────────── درع التنفيذ ───────────── */

test("الدرع يفهم الدارجة ويحوّلها لخطة أدوات", () => {
  assert.equal(shield("وريني الاحصائيات").plan[0].tool, "get_stats");
  assert.equal(shield("قائمة المستخدمين").plan[0].tool, "list_users");
  assert.equal(shield("احظر المستخدم 700000123 راه يزور الإحالات").plan.at(-1).tool, "block_user");
  assert.equal(shield("زيد 500 نقطة لـ @amina_bz").plan[0].args.delta, 500);
  assert.equal(shield("فك حظر الشبكة 41.100.10.0/24").plan[0].tool, "unblock_network");
  assert.equal(shield("غير كلمة السر الى newpass12345").plan[0].tool, "change_dashboard_password");
});

test("الدرع لا يرفض أبداً: طلب غامض لا يعطي خطة لكنه لا يكسر", () => {
  const out = shield("سلام كيفاش راك");
  assert.ok(Array.isArray(out.plan));
  assert.equal(out.confident, false);
});

/* ───────────── الأدوات ───────────── */

test("أداة الإحصائيات ترجع أرقاماً حقيقية", async () => {
  mkUser(910001);
  const out = await runTool("get_stats", {}, { source: "test" });
  assert.equal(out.ok, true);
  assert.ok(out.users >= 1);
});

test("أداة منح النقاط تغيّر الرصيد وتُسجّل تدقيقاً", async () => {
  const u = mkUser(910002);
  const out = await runTool("give_points", { user_id: u.tg_id, delta: 250, reason: "test" }, { source: "test" });
  assert.equal(out.ok, true);
  assert.equal(out.balance, 250);
});

test("أداة الحظر/فك الحظر تعمل", async () => {
  const u = mkUser(910003);
  await runTool("block_user", { user_id: u.tg_id, reason: "test" }, { source: "test" });
  let detail = await runTool("get_user", { user_id: u.tg_id }, { source: "test" });
  assert.equal(detail.user.blocked, true);
  await runTool("unblock_user", { user_id: u.tg_id }, { source: "test" });
  detail = await runTool("get_user", { user_id: u.tg_id }, { source: "test" });
  assert.equal(detail.user.blocked, false);
});

test("أداة الإعدادات ترفض المفاتيح غير المعروفة وتقبل الصحيحة", async () => {
  const bad = await runTool("update_settings", { settings: { hack: "1" } }, { source: "test" });
  assert.equal(bad.ok, false);
  const good = await runTool("update_settings", { settings: { points_correct: 12 } }, { source: "test" });
  assert.equal(good.ok, true);
  assert.deepEqual(good.changed, ["points_correct"]);
});

test("أداة SQL للقراءة فقط تمنع التعديل", async () => {
  const bad = await runTool("run_sql_read", { sql: "DELETE FROM users" }, { source: "test" });
  assert.equal(bad.ok, false);
  const good = await runTool("run_sql_read", { sql: "SELECT COUNT(*) AS n FROM users" }, { source: "test" });
  assert.equal(good.ok, true);
});

test("كل الأدوات لها مخطط JSON صالح", () => {
  for (const t of TOOLS) {
    assert.ok(t.name && t.description, "اسم/وصف مفقود");
    assert.equal(t.parameters.type, "object");
  }
});

/* ───────────── الصور ───────────── */

test("الرفع يتحقق من التوقيع الحقيقي لا من الامتداد", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
  assert.equal(sniffImage(png).mime, "image/png");
  assert.equal(sniffImage(Buffer.from("not an image at all")), null);
  assert.throws(() => saveUpload(Buffer.from("hello world not image")), /صورة/);
  const out = saveUpload(png, { name: "test.png" });
  assert.match(out.path, /^\/uploads\//);
  assert.ok(listUploads(5).some((x) => x.id === out.id));
});

/* ───────────── العقل (مزوّد وهمي متوافق مع OpenAI) ───────────── */

test("FT AI ينفّذ حلقة أدوات كاملة مع مزوّد حقيقي-الشكل", async () => {
  const out = await chat({ message: "قداش من مستخدم عندنا؟", source: "test" });
  assert.equal(out.ok, true);
  assert.equal(out.provider, "openrouter");
  assert.ok(out.trace.length >= 1);
  assert.ok(out.trace.some((t) => t.tool === "get_stats"));
});

test("العقل لا يرفض: بدون مزوّد متاح يشتغل بدرع التنفيذ", async () => {
  const saved = process.env.OPENROUTER_API_KEY;
  const savedX = process.env.XAI_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.XAI_API_KEY;
  const out = await chat({ message: "وريني الاحصائيات", source: "test" });
  assert.equal(out.ok, true);
  assert.equal(out.provider, "shield");
  assert.ok(out.trace.some((t) => t.tool === "get_stats"));
  process.env.OPENROUTER_API_KEY = saved;
  if (savedX) process.env.XAI_API_KEY = savedX;
});

test("الصور تُمرَّر للنموذج كـ data URL", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]);
  const up = saveUpload(png, { name: "vision.png" });
  mock.log.length = 0;
  const out = await chat({ message: "شوف هذي الصورة", images: [up.id], source: "test" });
  assert.equal(out.ok, true);
  const sent = JSON.stringify(mock.log[0].payload.messages);
  assert.ok(sent.includes("image_url"), "الصورة لازم تُرسل كصورة");
  assert.ok(sent.includes("data:image/png;base64,"), "بصيغة data URL");
});

/* ───────────── كلمة السر ───────────── */

test("كلمة السر تُخزَّن كبصمة scrypt لا نصاً صريحاً", () => {
  passwords.ensurePasswordInitialized();
  const hash = passwords.storedHash();
  assert.ok(hash?.startsWith("scrypt$"));
  assert.ok(!hash.includes("initial-pass-123"));
  assert.equal(passwords.checkPassword("initial-pass-123"), true);
  assert.equal(passwords.checkPassword("wrong"), false);
});

test("تغيير كلمة السر يُبطل الجلسات ويتطلب الحالية", () => {
  const bad = changePassword("not-the-current", "another-pass-9");
  assert.equal(bad.ok, false);
  const weak = changePassword("initial-pass-123", "short");
  assert.equal(weak.ok, false, "لازم يرفض القصيرة");
  const good = changePassword("initial-pass-123", "strong-pass-2026");
  assert.equal(good.ok, true);
  assert.equal(passwords.checkPassword("strong-pass-2026"), true);
  assert.equal(passwords.checkPassword("initial-pass-123"), false);
});

test.after?.(() => {
  mock.close();
  try { fs.unlinkSync(dbPath); } catch {}
});
