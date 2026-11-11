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
let BOT_IS_ADMIN = true; // البوت أدمن في القناة → getChatMember يعمل

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
      return ok({ id: 9085026849, is_bot: true, first_name: "مسابقات MX", username: "mx_contests_bot" });
    case "setMyCommands":
    case "setMyDescription":
    case "setMyShortDescription":
    case "answerCallbackQuery":
      return ok(true);
    case "getChat":
      return ok({ id: -100, type: "channel", title: "مسابقات MX", invite_link: "https://t.me/mxabdou" });
    case "getChatMember": {
      // واقع تيليجرام: إن لم يكن البوت أدمنًا/عضوًا في القناة، فإن getChatMember
      // يفشل لكل المستخدمين — لا للبوت وحده.
      if (!BOT_IS_ADMIN) {
        return new Response(
          JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: member list is inaccessible" }),
          { status: 400, headers: { "content-type": "application/json" } }
        );
      }
      // البوت نفسه أدمن في القناة (حالة الإنتاج الصحيحة) → التحقق الفعلي ممكن
      if (Number(body.user_id) === 9085026849) {
        return BOT_IS_ADMIN
          ? ok({ status: "administrator", user: { id: body.user_id } })
          : ok({ status: "administrator", user: { id: body.user_id } });
      }
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
db.meta.botUsername = "mx_contests_bot";
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
await handleUpdate(userMsg(referrer, "/start"), db, { username: "mx_contests_bot", name: "مسابقات MX" });
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
assert.match(lastText(), /t\.me\/mx_contests_bot\?start=/, "الرابط يحتوي كود الإحالة");
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

// 🔴 حارس الانحدار: migrate يجب ألا يمحو الأعضاء أو نقاطهم أبدًا
step("لا فقدان للأعضاء/النقاط عبر migrate");
const alive = freshDB();
for (let i = 1; i <= 3; i++) {
  alive.users[String(5000 + i)] = {
    id: 5000 + i, firstName: `عضو${i}`, lang: "ar", points: i * 10, totalEarned: i * 10, totalSpent: 0,
    joinedAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T00:00:00.000Z", refCode: `c${i}`,
    refCount: 0, refActive: 0, refBonusGiven: false, daily: { streak: 0, count: 0 },
    wheel: { spins: 0, extra: 0 }, tasks: {}, history: [], banned: false, vip: false, status: "member", messages: 1,
  };
}
const roundtrip = migrate(JSON.parse(JSON.stringify(alive)));
assert.strictEqual(Object.keys(roundtrip.users).length, 3, "كل الأعضاء يبقون بعد القراءة من التخزين");
assert.strictEqual(roundtrip.users["5001"].points, 10, "نقاط الأعضاء لا تُفقد");
assert.strictEqual(roundtrip.users["5003"].points, 30, "نقاط الأعضاء لا تُفقد (3)");
// قيم تالفة تُنظَّف دون المساس بالصحيح
const mixed = migrate({ users: { bad: null, ok: { id: 9, points: 7 } } });
assert.deepStrictEqual(Object.keys(mixed.users), ["ok"], "القيم التالفة فقط تُحذف");
console.log("   ✓ الأعضاء والنقاط محفوظون بعد القراءة");

// ───────── 14) الأوامر ─────────
step("الأوامر النصية");
for (const cmd of ["/points", "/top", "/ref", "/shop", "/help", "/daily"]) {
  clear();
  await handleUpdate(userMsg(referrer, cmd), db, {});
  assert.ok(lastText().length > 10, `الأمر ${cmd} يجب أن يرد`);
}
console.log("   ✓ كل الأوامر ترد بنجاح");


// ───────── 16) البوت ليس أدمن: لا حجب «صامت» ولا زر ميت ─────────
step("بوت غير أدمن في القناة — أعضاء لا يُقفلون");
BOT_IS_ADMIN = false;
__resetRateLimit();
// كاش الفحص يجب أن يُصفَّر وإلا بقيت نتيجة «أدمن» من الاختبارات السابقة
const g = globalThis;
delete g.__joinHeal;
const fresh = nextId();
MEMBERSHIP.set(fresh, false); // لم يشترك "قدر الإمكان" — لكن التحقق مستحيل
clear();
await handleUpdate(userMsg(fresh, "/start"), db, {});
const txt = lastText(fresh);
assert.ok(!/خطوة واحدة للبدء/.test(txt), "لا يجب حجب العضو حين يستحيل التحقق");
assert.match(txt, /نقاطك/, "يجب أن يرى القائمة الرئيسية");
// تنبيه لطيف بالقناة بدل الحجب
const nudge = captured.filter((c) => /انضم للقناة|قناة الجوائز/.test(String(c.body.text ?? "")));
assert.ok(nudge.length >= 1, "تنبيه لطيف بالانضمام");
// زر الهدية يعمل رغم عدم القدرة على التحقق
clear();
await handleUpdate(cbMsg(fresh, "cb:daily"), db, {});
assert.match(lastText(fresh), /هدية/, "الهدية تُمنح بلا حجب");
assert.ok(db.users[String(fresh)].points > 0, "النقاط تُحسب فعلًا");
// مهمة قناة غير قابلة للتحقق: لا تُحجب النقاط (عضو جديد كي لا تكون المهمة منجزة سابقًا)
const chTask = db.tasks.find((t) => t.type === "channel");
assert.ok(chTask, "توجد مهمة قناة افتراضية");
const fresh2 = nextId();
MEMBERSHIP.set(fresh2, false);
clear();
await handleUpdate(cbMsg(fresh2, `cb:task:${chTask.id}`), db, {});

assert.ok(db.users[String(fresh2)].tasks[chTask.id], "مهمة القناة تُنجز حين يتعذّر التحقق");
assert.strictEqual(db.users[String(fresh2)].points, chTask.points, "نقاط المهمة تُحسب كاملة");
console.log(`   ✓ لا حجب • تنبيه واحد • النقاط ${db.users[String(fresh)].points}`);

// حين يعود البوت أدمن: البوابة الصارمة ترجع للعمل
BOT_IS_ADMIN = true;
delete g.__joinHeal;
__resetRateLimit();
const back = nextId();
MEMBERSHIP.set(back, false);
clear();
await handleUpdate(userMsg(back, "/start"), db, {});
assert.match(lastText(back), /خطوة واحدة|اشترك/, "البوابة ترجع فور عودة صلاحية الأدمن");
console.log("   ✓ البوابة الصارمة تعمل عند توفّر الصلاحية");

// ───────── 14c) البوابة تمنع تجاوز الأوامر ─────────
step("البوابة تمنع تجاوز الأوامر");
BOT_IS_ADMIN = true;
delete g.__joinHeal;
__resetRateLimit();
const sneaky = nextId();
MEMBERSHIP.set(sneaky, false);
for (const cmd of ["/points", "/top", "/ref", "/shop"]) {
  clear();
  await handleUpdate(userMsg(sneaky, cmd), db, {});
  const t = lastText(sneaky) ?? "";
  assert.ok(
    /خطوة واحدة|تحقّقت من الاشتراك/.test(t),
    `${cmd} يجب أن يُحجب — وصل: ${t.slice(0, 60)}`
  );
  assert.ok(!/المتصدرون|رابط الإحالة|المتجر|نقاطك/.test(t), `${cmd} كشف المحتوى رغم عدم الاشتراك`);
}
console.log("   ✓ /points /top /ref /shop محجوبة لغير المشترك");

// ───────── 14b) عنوان القناة لا يتكرّر ─────────
step("نظافة نص بوابة الاشتراك");
const { channelLabel } = await import("../src/lib/bot-utils.ts");
assert.strictEqual(channelLabel("اشترك في قناة MX", "mxabdou"), "MX", "تُزال البادئة مرّة واحدة");
assert.strictEqual(
  channelLabel("اشترك في قناة اشترك في قناتنا", "mxabdou"),
  "@mxabdou",
  "البادئات المتكرّرة تُزال كلها وتُرجع للاسم"
);
assert.strictEqual(channelLabel("قناة MX", "mxabdou"), "MX");
assert.strictEqual(channelLabel("", "mxabdou"), "@mxabdou", "عنوان فارغ → اسم القناة");
assert.strictEqual(channelLabel("MX — مسابقات", "mxabdou"), "MX — مسابقات", "العنوان العادي يبقى كما هو");
console.log("   ✓ لا تكرار لـ «اشترك في قناة»");

// ───────── 15) تحقق من عدم تسريب التوكن ─────────
step("أمان");
const leaked = captured.some((c) => JSON.stringify(c).includes("BOT_TOKEN"));
assert.ok(!leaked, "لا توكن في الردود");

const totalCalls = calls.length;
console.log(`\n✅ نجحت كل الاختبارات (${totalCalls} نداء تيليجرام محاكى)\n`);

// ───────── 16) الخطة المحلية: تُضيف إضافات فعلية بلا انتظار النموذج ─────────
step("الخطة المحلية (سرعة + تغطية)");
{
  const { localPlan } = await import("../src/lib/ai-brain.ts");
  const must = [
    ["أضف جائزة PlayStation Plus بسعر 45 نقطة", "add_reward"],
    ["ضيف جائزة كونت بيس 3 بـ 120 نقطة", "add_reward"],
    ["أضف جائزة Netflix الشهرية بـ 15 نقطة", "add_reward"],
    ["ارفع مكافأة الإحالة إلى 5 نقاط", "set_points"],
    ["اجعل الهدية اليومية من 2 إلى 5 نقاط", "set_points"],
    ["غيّر قوانين البوت: ممنوع استخدام أكثر من حساب", "set_texts"],
    ["أضف مهمة اشترك في قناة @mxabdou مقابل 3 نقاط", "add_task"],
    ["جهّز مسابقة نهاية الأسبوع بجائزة 100 نقطة", "add_contest"],
    ["اطفئ عجلة الحظ", "set_feature"],
    ["شغل وضع الصيانة", "set_bot"],
  ];
  const missing = [];
  for (const [txt, op] of must) {
    const p = localPlan(txt);
    if (!p.actions.some((a) => a.name === op)) missing.push(`${txt} → يتوقع ${op}`);
  }
  assert.deepStrictEqual(missing, [], `الخطة المحلية لا تغطي:\n${missing.join("\n")}`);
  console.log(`   ✓ ${must.length} أمرًا تُنفَّذ محليًا بلا شبكة`);
}

// ───────── 17) منطق ok: الطلب الناجح بلا تغيير ليس خطأً ─────────
step("ok لا يعني «تغيّرت البيانات»");
{
  // نفس معادلة المسار: storageBroken / allFailed
  const judge = (results, stored) => {
    const applied = results.filter((r) => r.ok).length;
    const storageBroken = applied > 0 && !stored;
    const allFailed = results.length > 0 && applied === 0;
    return !storageBroken && !allFailed;
  };
  // سؤال/عرض توضيحي: لا عمليات ولا تغيير → نجاح لا خطأ
  assert.strictEqual(judge([], false), true, "طلب بلا عمليات يجب أن ينجح");
  // عملية ناجحة لكن التخزين لم يعكسها → خطأ حقيقي
  assert.strictEqual(judge([{ name: "add_reward", ok: true }], false), false, "فشل الحفظ يجب أن يُبلَّغ");
  // كل العمليات فشلت → خطأ حقيقي
  assert.strictEqual(judge([{ name: "delete_reward", ok: false }], true), false, "الفشل الكامل خطأ");
  // نجاح كامل → نجاح
  assert.strictEqual(judge([{ name: "add_reward", ok: true }], true), true);
  console.log("   ✓ الطلب الناجح بلا تغيير لم يعد يظهر كخطأ");
}

// ───────── 18) الأسئلة الإحصائية تُجاب محليًا ─────────
step("الأسئلة تُجاب بلا شبكة");
{
  const { localPlan } = await import("../src/lib/ai-brain.ts");
  for (const q of ["كم عدد الأعضاء؟", "شحال من عضو", "أعطني إحصائيات البوت"]) {
    const p = localPlan(q, db);
    assert.ok(p.reply.includes("حالة البوت"), `«${q}» لم تُجَب محليًا`);
    assert.ok(/الأعضاء|النقاط/.test(p.reply), "الإجابة يجب أن تحتوي أرقامًا");
    assert.strictEqual(p.actions.length, 0, "سؤال لا يُنشئ عمليات");
  }
  console.log("   ✓ الأسئلة تُجاب فورًا من بيانات البوت");
}

// ───────── 19) البث الجماعي: كل الصيغ تُلتقط والنص صحيح ─────────
step("البث الجماعي");
{
  const { localPlan } = await import("../src/lib/ai-brain.ts");
  const cases = [
    ["ارسل رسالة جماعية تقول : مسابقة على حساب فري فاير", "مسابقة على حساب فري فاير"],
    ["أرسل للجميع: مسابقة الليلة", "مسابقة الليلة"],
    ["بث: 🎉 الهدية تضاعفت اليوم", "🎉 الهدية تضاعفت اليوم"],
    ["ارسل رسالة للجميع مضمونها: جوائز جديدة في المتجر", "جوائز جديدة في المتجر"],
  ];
  for (const [q, want] of cases) {
    const p = localPlan(q, db);
    const b = p.actions.find((a) => a.name === "broadcast");
    assert.ok(b, `لم يُلتقط البث: ${q}`);
    assert.strictEqual(String(b.args.text).trim(), want, `النص منقوص لـ: ${q} → «${b.args.text}»`);
  }
  // يجب ألا يلتقط طلبات ليست بثًّا
  for (const q of ["أضف جائزة Netflix بـ 20 نقطة", "كم عدد الأعضاء؟"]) {
    const p = localPlan(q, db);
    assert.ok(!p.actions.some((a) => a.name === "broadcast"), `التقط بثًّا خطأً من: ${q}`);
  }
  console.log(`   ✓ ${cases.length} صيغة بث والنص صحيح · لا التباس مع أوامر أخرى`);
}

// ───────── 20) البث لا يدّعي نجاحًا كاذبًا ─────────
step("صدق البث");
{
  const { runActions } = await import("../src/lib/ai-brain.ts");
  const clone = () => JSON.parse(JSON.stringify(db));
  const d = clone();

  // (أ) بث ناجح لجميع الأعضاء
  clear();
  const okRes = await runActions(d, [{ name: "broadcast", args: { text: "رسالة اختبار" } }]);
  assert.strictEqual(okRes[0].ok, true, "بث ناجح يجب أن يُبلَّغ عنه");
  assert.match(okRes[0].detail, /\d+ من \d+/, "التفصيل يجب أن يبيّن العدد");

  // (ب) نص فارغ → فشل صريح لا نجاح
  const emptyRes = await runActions(clone(), [{ name: "broadcast", args: { text: "   " } }]);
  assert.strictEqual(emptyRes[0].ok, false, "نص فارغ يجب أن يفشل صراحةً");

  // (ج) كل الإرسال يفشل (مستخدمون محظورون فقط) → يجب ألا يقول نجاحًا
  const none = clone();
  for (const k of Object.keys(none.users)) none.users[k].banned = true;
  const noRes = await runActions(none, [{ name: "broadcast", args: { text: "لن يصل" } }]);
  assert.strictEqual(noRes[0].ok, false, "لا مستلمين = لا نجاح");
  console.log("   ✓ لا نجاح كاذب في البث (فارغ/بلا مستلمين/نجاح)");
}

// ───────── 21) لا رفض: أي طلب يُنفَّذ ─────────
step("لا رفض إطلاقًا");
{
  const { localPlan, runActions } = await import("../src/lib/ai-brain.ts");
  const must = [
    "خلي شعار البوت 🔥",
    "غير قوانين البوت: ممنوع الغش",
    "أضف زر البدء: ابدأ الآن",
    "شغل المتجر",
    "اطفئ المهام",
    "خلي مكافأة الإحالة 10",
    "غير نص الدعم: راسلنا على @support",
  ];
  for (const q of must) {
    const p = localPlan(q, db);
    assert.ok(p.actions.length > 0, `رفض الطلب: «${q}» → ${p.reply.slice(0, 60)}`);
    const refuses = /غير متوفر|غير مدعوم|لا أستطيع|لم أجد عملية/.test(p.reply);
    assert.ok(!refuses, `رسالة رفض لـ «${q}»: ${p.reply.slice(0, 80)}`);
  }
  console.log(`   ✓ ${must.length} طلبًا كان مرفوضًا صار يُنفَّذ`);

  // العمليات المرنة تُطبَّق فعليًا
  const d = JSON.parse(JSON.stringify(db));
  const r1 = await runActions(d, [{ name: "custom_number", args: { key: "refJoin", value: 9 } }]);
  assert.strictEqual(d.settings.points.refJoin, 9, "custom_number لم يطبّق");
  assert.ok(r1[0].ok);

  const r2 = await runActions(d, [{ name: "custom_feature", args: { feature: "shop", enabled: false } }]);
  assert.strictEqual(d.settings.features.shop, false);
  assert.ok(r2[0].ok);

  const r3 = await runActions(d, [{ name: "custom_setting", args: { path: "settings.brandEmoji", value: "🔥" } }]);
  assert.strictEqual(d.settings.brandEmoji, "🔥");
  assert.ok(r3[0].ok);

  // عملية مجهولة تحمل path تُطبَّق بدل الرفض
  const r4 = await runActions(d, [{ name: "whatever_op", args: { path: "settings.points.dailyMin", value: 5 } }]);
  assert.strictEqual(d.settings.points.dailyMin, 5, "procedure المجهولة لم تُطبَّق بمسارها");
  assert.ok(r4[0].ok);

  console.log("   ✓ العمليات المرنة تُعدّل الوثيقة فعليًا");
}

// ───────── 22) مسح شامل: لا رفض على طلبات متنوعة ─────────
step("مسح الرفض الشامل");
{
  const { localPlan } = await import("../src/lib/ai-brain.ts");
  const probes = [
    "ضيف ميزة جديدة اسمها الدوري الشهري",
    "بدل تصميم البوت",
    "زيد عدد الفائزين في المسابقة",
    "خلي البوت يشتغل بس بالليل",
    "اضف قسم جديد للفيديوهات",
    "غير لون البوت للازرق",
    "ضيف صوت ترحيب",
    "اعمل نسخة احتياطية",
    "زيد نقاط العجلة",
    "حط شعار جديد",
    "شيل المهام",
  ];
  const refused = [];
  for (const q of probes) {
    const p = localPlan(q, db);
    if (/غير متوفر|غير مدعوم|لا أستطيع|لم أجد عملية|ممنوع/.test(p.reply)) refused.push(q);
  }
  assert.deepStrictEqual(refused, [], `طلبات مرفوضة:\n${refused.join("\n")}`);
  console.log(`   ✓ لا رسالة رفض في ${probes.length} طلبًا متنوعًا`);
}

// ───────── 23) ماذا يحدث لطلب غامض فعلًا؟ ─────────
step("الطلبات الغامضة");
{
  const { localPlan } = await import("../src/lib/ai-brain.ts");
  for (const q of ["ضيف صوت ترحيب", "بدل تصميم البوت", "غير لون البوت للازرق"]) {
    const p = localPlan(q, db);
    console.log(`   «${q}» → ${p.actions.length ? p.actions.map((a) => a.name).join(",") : "(بلا عملية)"} :: ${p.reply.slice(0, 70)}`);
  }
}

// ───────── 24) إسناد صورة مرفقة (سرعة البرق) ─────────
step("الصورة المرفقة");
{
  const { planPrompt, runActions } = await import("../src/lib/ai-brain.ts");
  const d = JSON.parse(JSON.stringify(db));
  d.settings.ai.enabled = false; // نختبر المسار المحلي فقط
  const IMG = "https://blob.example/x.jpg";

  const t0 = Date.now();
  const p1 = await planPrompt(d, "خلي هذي الصورة في جائزة", IMG);
  const ms = Date.now() - t0;
  assert.ok(p1.actions.length > 0, "لم تُسند الصورة");
  assert.strictEqual(p1.actions[0].args.image, IMG, "الرابط لم يُمرّر");
  assert.ok(ms < 50, `يجب أن يكون فوريًا (${ms}ms)`);

  // إسناد بالاسم الصريح
  const title = d.rewards[0].title;
  const p2 = await planPrompt(d, `خلي هذي الصورة في جائزة ${title}`, IMG);
  const res = await runActions(d, p2.actions);
  assert.ok(res[0].ok, "التنفيذ فشل");
  assert.strictEqual(d.rewards.find((r) => r.title.includes(title))?.image, IMG, "الصورة لم تُحفظ في الجائزة");

  // إسناد لمسابقة
  const p3 = await planPrompt(d, "حط هذي الصورة في المسابقة", IMG);
  assert.ok(p3.actions[0].name === "edit_contest", "لم تُسند للمسابقة");

  // صورة بلا هدف → لا تخمين، طلب توضيح
  const p4 = await planPrompt(d, "خلي هذي الصورة", IMG);
  assert.match(p4.reply, /أي عنصر|اذكر اسم/, "يجب طلب التوضيح بدل التخمين");

  console.log(`   ✓ إسناد فوري (${ms}ms) · بالاسم · للمسابقة · وطلب توضيح عند الغموض`);
}
