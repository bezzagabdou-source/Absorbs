/** اختبار محرّك الأوامر العربي المدمج + منفّذ العمليات (بدون إنترنت). */
import assert from "node:assert";

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }));
  if (u.includes("generativelanguage")) return new Response(JSON.stringify({}), { status: 400 });
  throw new Error("شبكة ممنوعة: " + u);
};

const { freshDB } = await import("../src/lib/defaults.ts");
const { localPlan, runActions, planPrompt } = await import("../src/lib/ai-brain.ts");

const db = freshDB();
const log = (s) => console.log(`   ✓ ${s}`);

// 1) الهدية اليومية من ١ إلى ٣
let p = localPlan("اجعل الهدية اليومية من ١ إلى ٣ نقاط");
assert.ok(p.actions.some((a) => a.name === "set_points" && a.args.points.dailyMin === 1 && a.args.points.dailyMax === 3), "تحليل الأرقام العربية");
await runActions(db, p.actions);
assert.strictEqual(db.settings.points.dailyMin, 1);
assert.strictEqual(db.settings.points.dailyMax, 3);
log("فهم الأرقام العربية وتعديل الهدية: " + p.reply.replace(/\n/g, " "));

// 2) إضافة جائزة
p = localPlan("أضف جائزة PlayStation Plus بسعر 45 نقطة");
assert.ok(p.actions[0].name === "add_reward", "إضافة جائزة");
let r = await runActions(db, p.actions);
assert.ok(r[0].ok, "تنفيذ إضافة الجائزة");
assert.ok(db.rewards.some((x) => x.title.includes("PlayStation")), "الجائزة أُضيفت");
log(`أضيفت جائزة: ${db.rewards.at(-1).title} = ${db.rewards.at(-1).cost} نقطة`);

// 3) تعديل مكافأة الإحالة
p = localPlan("ارفع مكافأة الإحالة إلى 5 نقاط");
await runActions(db, p.actions);
assert.strictEqual(db.settings.points.refJoin, 5);
log("مكافأة الإحالة = " + db.settings.points.refJoin);

// 4) صيانة
p = localPlan("شغل وضع الصيانة");
await runActions(db, p.actions);
assert.strictEqual(db.settings.maintenance, true);
p = localPlan("ألغِ وضع الصيانة");
await runActions(db, p.actions);
assert.strictEqual(db.settings.maintenance, false);
log("الصيانة تعمل وتُلغى");

// 5) بث
p = localPlan("بث: مسابقة الليلة الساعة 9");
assert.ok(p.actions[0].name === "broadcast");
log("البث يُلتقط: " + String(p.actions[0].args.text));

// 6) نقاط لمستخدم
db.users["777"] = {
  id: 777, firstName: "أحمد", username: "ahmed", lang: "ar", points: 0, totalEarned: 0, totalSpent: 0,
  joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), refCode: "ahd1", refCount: 0,
  refActive: 0, refBonusGiven: false, daily: { streak: 0, count: 0 }, wheel: { lastAt: undefined, spins: 0, extra: 0 },
  tasks: {}, history: [], banned: false, vip: false, status: "member", messages: 0,
};
p = localPlan("أعطي @ahmed 50 نقطة");
r = await runActions(db, p.actions);
assert.ok(r[0].ok, "منح النقاط");
assert.strictEqual(db.users["777"].points, 50);
log("منح 50 نقطة إلى @ahmed → الرصيد " + db.users["777"].points);

// 7) مهمة جديدة
p = localPlan("أضف مهمة شاهد الفيديو");
await runActions(db, p.actions);
assert.ok(db.tasks.some((t) => t.title.includes("شاهد")), "المهمة أُضيفت");
log("أُضيفت مهمة: " + db.tasks.at(-1).title);

// 8) اشتراك إجباري
p = localPlan("اجعل قناة الاشتراك الإجباري @newchannel");
await runActions(db, p.actions);
assert.strictEqual(db.settings.forceJoin.username, "newchannel");
log("قناة الاشتراك: @" + db.settings.forceJoin.username);

// 9) طلب غير مفهوم
p = localPlan("مرحبا كيف حالك");
assert.ok(p.actions.length === 0 && p.reply.length > 10, "رد لطيف بدون عمليات");
log("طلب غير مفهوم → رد إرشادي");

// 10) planPrompt بدون مفاتيح → المحرك المدمج
delete process.env.GEMINI_API_KEY;
delete process.env.OPENROUTER_API_KEY;
const auto = await planPrompt(db, "اجعل العجلة كل 6 ساعات");
assert.ok(auto.builtin, "يستخدم المحرك المدمج");
assert.strictEqual(db.settings.ai.enabled, true);
log("planPrompt يعمل بدون أي مفتاح AI");

console.log("\n✅ نجح اختبار الذكاء الاصطناعي بالكامل\n");
