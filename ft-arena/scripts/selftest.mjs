/**
 * اختبار ذاتي شامل للبوت — يحاكي تيليجرام ويشغّل السيناريوهات الحقيقية:
 * /start، إحالة، هدية يومية، عجلة، مهام، استبدال جائزة، متصدرون، لوحة الاشتراك.
 *
 * التشغيل: node scripts/selftest.mjs
 */
import assert from "node:assert";

// توكن وهمي فقط ليسمح الغلاف بالمرور — كل نداءات fetch مُحاكاة أدناه.
process.env.BOT_TOKEN = "test:token";

const captured = [];
const calls = [];
const MEMBERSHIP = new Map(); // userId -> joined?

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  if (!u.startsWith("https://api.telegram.org/")) throw new Error(`شبكة ممنوعة في الاختبار: ${u}`);
  const method = u.split("/").pop();
  const body = init.body ? JSON.parse(init.body) : {};
  calls.push({ method, body });
  captured.push({ method, body });

  const ok = (result) =>
    new Response(JSON.stringify({ ok: true, result }), { status: 200, headers: { "content-type": "application/json" } });

  switch (method) {
    case "getMe":
      return ok({ id: 9085026849, is_bot: true, first_name: "FT Arena", username: "ftarena_bot" });
    case "setMyCommands":
    case "setMyDescription":
    case "setMyShortDescription":
    case "answerCallbackQuery":
      return ok(true);
    case "getChat":
      return ok({ id: -100, type: "channel", title: "FT Arena", invite_link: "https://t.me/mxabdou" });
    case "getChatMember": {
      const joined = MEMBERSHIP.get(Number(body.user_id)) !== false;
      return ok({ status: joined ? "member" : "left", user: { id: body.user_id } });
    }
    case "getUserProfilePhotos":
      return ok({ total_count: 1, photos: [[{ file_id: "photo_abc" }]] });
    case "getFile":
      return ok({ file_id: body.file_id, file_path: "photos/file.jpg" });
    default:
      return ok({ message_id: 1, chat: { id: body.chat_id, type: "private" } });
  }
};

const { freshDB, migrate } = await import("../src/lib/defaults.ts");
const { handleUpdate, __resetRateLimit } = await import("../src/lib/bot.ts");
const { addPoints, displayName, countUsers } = await import("../src/lib/bot-utils.ts");

// ───────── helpers ─────────
const db = freshDB();
db.meta.botUsername = "ftarena_bot";
db.settings.forceJoin.username = "mxabdou";
db.settings.admin.adminChatId = "999";

let uid = 100000;
const nextId = () => ++uid;

function userMsg(id, text) {
  __resetRateLimit();
  currentChat = id;
  return { update_id: Math.random(), message: { message_id: 1, from: { id, first_name: `مستخدم${id % 1000}`, username: `u${id % 1000}` }, chat: { id, type: "private" }, date: Date.now() / 1000 | 0, text } };
}
function cbMsg(id, data) {
  __resetRateLimit();
  currentChat = id;
  return { update_id: Math.random(), callback_query: { id: "cb1", from: { id, first_name: `مستخدم${id % 1000}`, username: `u${id % 1000}` }, data, message: { message_id: 5, chat: { id, type: "private" }, date: 0 } } };
}
let currentChat = null; // المحادثة التي نتحقق من ردّها (لا إشعارات الأدمن)
const lastText = (chat) => {
  const target = String(chat ?? currentChat ?? "");
  for (let i = captured.length - 1; i >= 0; i--) {
    const c = captured[i];
    const cid = String(c.body?.chat_id ?? "");
    if (target && cid !== target) continue;
    if (["sendMessage", "editMessageText"].includes(c.method)) return c.body.text;
    if (c.method === "sendPhoto") return c.body.caption ?? "";
    if (c.method === "sendMediaGroup") return c.body.media?.[0]?.caption ?? "";
  }
  return "";
};
const lastKb = () => {
  for (let i = captured.length - 1; i >= 0; i--) {
    const b = captured[i].body;
    if (b?.reply_markup) return b.reply_markup;
  }
  return null;
};
const clear = () => captured.length = 0;
const step = (name) => console.log(`\n▸ ${name}`);

// ───────── 1) مستخدم جديد + إحالة ─────────
step("عضو جديد يدخل برابط إحالة");
const referrer = nextId();
await handleUpdate(userMsg(referrer, "/start"), db, { username: "ftarena_bot", name: "FT Arena" });
assert.ok(db.users[String(referrer)], "يجب إنشاء المستخدم");
assert.match(lastText(), /نقاطك/, "شاشة الترحيب");
clear();

const code = db.users[String(referrer)].refCode;
const invited = nextId();
MEMBERSHIP.set(invited, false); // لم يشترك بعد → يُوجَّه لبوابة القناة
await handleUpdate(userMsg(invited, `/start ${code}`), db, {});
assert.strictEqual(db.users[String(invited)].refBy, referrer, "ربط الإحالة");
assert.strictEqual(db.users[String(referrer)].refCount, 1, "عدّاد الإحالة");
assert.ok(db.users[String(referrer)].points >= db.settings.points.refJoin, "مكافأة الدخول");
assert.match(lastText(invited), /اشترك/, "على المنضم الاشتراك بالقناة أولًا");
const refMsgs = captured.filter((c) => c.method === "sendMediaGroup" || c.method === "sendPhoto");
assert.ok(refMsgs.length > 0, "إشعار الإحالة يجب أن يصل (مع الصور)");
assert.ok(refMsgs.some((c) => String(c.body.chat_id) === String(referrer)), "الإشعار للداعي");
console.log("   ✓ الإحالة ربطت + النقاط + إشعار بصورة الداعي والمنضم");
clear();

// ───────── 2) بوابة الاشتراك ─────────
step("اشتراك إجباري يمنع غير المشتركين");
const stranger = nextId();
MEMBERSHIP.set(stranger, false);
await handleUpdate(userMsg(stranger, "/start"), db, {});
assert.match(lastText(), /اشترك/, "يجب طلب الاشتراك");
const kb = lastKb();
assert.ok(JSON.stringify(kb).includes("mxabdou"), "زر القناة في الكيبورد");
console.log("   ✓ البوابة تعمل مع زر القناة");

MEMBERSHIP.set(stranger, true);
await handleUpdate(cbMsg(stranger, "check_join"), db, {});
assert.match(lastText(), /نقاطك/, "بعد التحقق يظهر البوت");
console.log("   ✓ التحقق يفتح البوت");
clear();

// ───────── 3) تفعيل الإحالة ─────────
step("مكافأة تفعيل الإحالة");
MEMBERSHIP.set(invited, true);
const before = db.users[String(referrer)].points;
await handleUpdate(cbMsg(invited, "check_join"), db, {});
assert.ok(db.users[String(referrer)].points > before, "نقاط التفعيل تُضاف للداعي");
assert.strictEqual(db.users[String(referrer)].refActive, 1, "إحالة مؤكدة");
console.log(`   ✓ +${db.users[String(referrer)].points - before} نقطة للداعي`);
clear();

// ───────── 4) الهدية اليومية ─────────
step("الهدية اليومية (1–3 نقاط)");
const u = db.users[String(invited)];
const p0 = u.points;
await handleUpdate(cbMsg(invited, "cb:daily"), db, {});
const gained = u.points - p0;
assert.ok(gained >= db.settings.points.dailyMin && gained <= db.settings.points.dailyMax + db.settings.points.streakBonus, `الهدية خارج النطاق: ${gained}`);
assert.match(lastText(), /هدية اليوم/);
console.log(`   ✓ حصل على ${gained} نقطة`);

clear();
await handleUpdate(cbMsg(invited, "cb:daily"), db, {});
assert.match(lastText(), /بالفعل|غدًا/, "لا يمكن أخذ الهدية مرتين");
console.log("   ✓ منع الهدية المكررة");
clear();

// ───────── 5) العجلة ─────────
step("عجلة الحظ");
await handleUpdate(cbMsg(invited, "cb:spin"), db, {});
assert.ok(u.wheel.spins === 1, "دورة واحدة");
assert.match(lastText(), /العجلة|حظ/, "نتيجة العجلة");
console.log("   ✓ العجلة تعمل");
clear();

// ───────── 6) المهام ─────────
step("المهام");
await handleUpdate(cbMsg(invited, "cb:task_custom"), db, {});
// المهمة الأولى هي قناة؛ نختبر مهمة القناة
const task = db.tasks[0];
const pBefore = u.points;
await handleUpdate(cbMsg(invited, `cb:task:${task.id}`), db, {});
assert.ok(u.points > pBefore, "نقاط المهمة");
assert.match(lastText(), /منجزة|المهام|✅/, "شاشة المهام");
console.log(`   ✓ المهمة منحت +${u.points - pBefore} نقطة`);
clear();

// ───────── 7) المتصدرون ─────────
step("المتصدرون");
await handleUpdate(cbMsg(invited, "cb:top"), db, {});
assert.match(lastText(), /المتصدرون/);
assert.ok(lastText().includes(displayName(u)) || lastText().includes("نقطة"), "قائمة المتصدرين");
console.log("   ✓ لوحة المتصدرين");
clear();

// ───────── 8) الإحالة والرابط ─────────
step("رابط الإحالة");
await handleUpdate(cbMsg(invited, "cb:ref"), db, {});
assert.match(lastText(), /t\.me\/ftarena_bot\?start=/, "الرابط يحتوي كود الإحالة");
console.log("   ✓ رابط الإحالة صحيح");
clear();

// ───────── 9) الاستبدال ─────────
step("استبدال جائزة (نتفليكس 20)");
addPoints(db, invited, 40, "admin", "اختبار");
const reward = db.rewards.find((r) => r.title.includes("نتفليكس"));
const pBefore2 = u.points;
await handleUpdate(cbMsg(invited, `cb:buy:${reward.id}`), db, {});
assert.strictEqual(u.points, pBefore2 - reward.cost, "خصم النقاط");
assert.ok(db.claims.length === 1, "إنشاء طلب");
assert.match(lastText(), /طلبك|رمز الطلب/);
console.log(`   ✓ خُصم ${reward.cost} نقطة وأُنشئ طلب ${db.claims[0].code}`);
clear();

// ───────── 10) النقاط غير الكافية ─────────
step("منع الاستبدال بدون نقاط");
addPoints(db, invited, -1000, "admin", "تصفير");
await handleUpdate(cbMsg(invited, `cb:buy:${reward.id}`), db, {});
assert.match(lastText(), /غير كافية|اجمع/);
console.log("   ✓ الحماية من الرصيد السالب");
clear();

// ───────── 11) المحظور ─────────
step("حظر مستخدم");
u.banned = true;
await handleUpdate(userMsg(invited, "/start"), db, {});
assert.match(lastText(), /محظور/);
u.banned = false;
console.log("   ✓ الحظر يعمل");
clear();

// ───────── 12) الإحصاءات ─────────
step("الإحصائيات");
const c = countUsers(db);
assert.ok(c.total >= 3, "عدد الأعضاء");
assert.ok(db.counters.dailyClaims >= 1, "عدّاد الهدايا");
console.log(`   ✓ ${c.total} عضو • ${c.points} نقطة • ${db.counters.dailyClaims} هدية`);

// ───────── 13) الترقية (migrate) ─────────
step("ترقية قاعدة قديمة");
const legacy = { settings: { botName: "قديم" }, users: {} };
const m = migrate(legacy);
assert.ok(m.settings.forceJoin && m.settings.features && m.wheel.length > 0, "الحقول الجديدة تُملأ");
assert.strictEqual(m.settings.botName, "قديم", "القيم القديمة تبقى");
console.log("   ✓ الترقية آمنة");

// ───────── 14) الأوامر ─────────
step("الأوامر النصية");
for (const cmd of ["/points", "/top", "/ref", "/shop", "/help", "/daily"]) {
  clear();
  await handleUpdate(userMsg(referrer, cmd), db, {});
  assert.ok(lastText().length > 10, `الأمر ${cmd} يجب أن يرد`);
}
console.log("   ✓ كل الأوامر ترد بنجاح");

// ───────── 15) تحقق من عدم تسريب التوكن ─────────
step("أمان");
const leaked = captured.some((c) => JSON.stringify(c).includes("BOT_TOKEN"));
assert.ok(!leaked, "لا توكن في الردود");

const totalCalls = calls.length;
console.log(`\n✅ نجحت كل الاختبارات (${totalCalls} نداء تيليجرام محاكى)\n`);
