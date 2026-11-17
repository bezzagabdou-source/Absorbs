/**
 * e2e.mjs — اختبار شامل من البداية للنهاية للبوت ولوحة التحكم.
 * يشغّل سيرفر تيليجرام وهمي + قاعدة Postgres محلية (PGlite) + Next dev.
 * التشغيل: node scripts/e2e.mjs
 */
import assert from "node:assert/strict";
import { Client } from "pg";

const BASE = process.env.E2E_BASE || "http://127.0.0.1:3100";
const MOCK = process.env.E2E_MOCK || "http://127.0.0.1:4001";
const SECRET = "testsecret";
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres@127.0.0.1:5432/postgres?sslmode=disable";

const db = new Client({ connectionString: DB_URL });
await db.connect();

let passed = 0;
const failures = [];
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failures.push({ name, err });
    console.log(`  ❌ ${name}\n     ${err.message}`);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mockState() {
  const res = await fetch(`${MOCK}/__state`);
  return res.json();
}

async function resetSent() {
  await fetch(`${MOCK}/__reset`, { method: "POST" });
}

async function membership(map) {
  await fetch(`${MOCK}/__membership`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(map) });
}

async function waitForMessage(chatId, matcher, timeout = 9000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const state = await mockState();
    const found = state.sent.filter((m) => m.chat_id === chatId).reverse().find((m) => matcher(m));
    if (found) return found;
    await sleep(220);
  }
  const state = await mockState();
  const dump = state.sent
    .filter((m) => m.chat_id === chatId)
    .slice(-3)
    .map((m) => `${m.method}: ${(m.text || "").slice(0, 200)}`)
    .join("\n---\n");
  throw new Error(`لم تصل رسالة مطابقة للمستخدم ${chatId}. آخر الرسائل:\n${dump}`);
}

async function sendUpdate(update, secret = SECRET) {
  const res = await fetch(`${BASE}/api/telegram/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
    body: JSON.stringify(update),
  });
  return res;
}

let uid = 5000;
const users = {
  buyer: { id: 555, is_bot: false, first_name: "أمين", username: "amine_dz", language_code: "ar" },
  owner: { id: 777, is_bot: false, first_name: "المالك", username: "F_Q_Q_T", language_code: "ar" },
  other: { id: 999, is_bot: false, first_name: "زائر", username: "guest_dz", language_code: "ar" },
};

const msg = (from, text) => ({
  update_id: ++uid,
  message: { message_id: uid, from, chat: { id: from.id, type: "private" }, date: Math.floor(Date.now() / 1000), text },
});

const photoMsg = (from, caption) => ({
  update_id: ++uid,
  message: {
    message_id: uid,
    from,
    chat: { id: from.id, type: "private" },
    date: Math.floor(Date.now() / 1000),
    caption,
    photo: [
      { file_id: "small_1", file_unique_id: "u1", width: 90, height: 90 },
      { file_id: "receipt_big_1", file_unique_id: "u2", width: 900, height: 1200 },
    ],
  },
});

const cb = (from, data) => ({
  update_id: ++uid,
  callback_query: {
    id: `cq-${uid}`,
    from,
    data,
    message: { message_id: 100, chat: { id: from.id, type: "private" }, date: Math.floor(Date.now() / 1000), text: "panel" },
  },
});

const buttonsOf = (m) => (m?.reply_markup?.inline_keyboard ?? []).flat();
const hasButton = (m, text) => buttonsOf(m).some((b) => (b.text ?? "").includes(text));
const callbackButton = (m, text) => buttonsOf(m).find((b) => (b.text ?? "").includes(text));

/* ───────────────────────── الاختبار ───────────────────────── */

console.log("\n🚀 CHINWI STORE — E2E test\n");

// تصفير بيانات التشغيل حتى يكون الاختبار قابلاً للتكرار (الكاتالوج يبقى)
await db.query("DELETE FROM orders; DELETE FROM ai_messages; DELETE FROM broadcasts; DELETE FROM logs; DELETE FROM users;");
await db.query("DELETE FROM settings WHERE key IN ('emoji_map','webhook_url','webhook_set_at')");
await db.query("UPDATE settings SET value = 'false'::jsonb WHERE key = 'emoji_animated'");
await db.query("UPDATE settings SET value = 'false'::jsonb WHERE key = 'maintenance'");
await db.query("UPDATE settings SET value = 'true'::jsonb WHERE key = 'require_subscription'");
await db.query("UPDATE settings SET value = 'false'::jsonb WHERE key = 'gate_warned'");

/* 0. الصحة */
await check("health: قاعدة البيانات متصلة والمنتجات مزروعة", async () => {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  assert.equal(health.db.connected, true);
  assert.ok(health.db.products >= 70, `منتجات=${health.db.products}`);
});

await check("seed: الأقسام والمحافظ والقنوات", async () => {
  const cats = await db.query("select slug from categories order by sort");
  const slugs = cats.rows.map((r) => r.slug);
  for (const slug of ["freefire", "efootball", "tiktok", "telegram", "digital"]) assert.ok(slugs.includes(slug), slug);
  const wallets = await db.query("select name, account, emoji from wallets order by sort");
  assert.equal(wallets.rowCount, 4);
  assert.equal(wallets.rows[0].account, "1210865168");
  assert.equal(wallets.rows[2].name, "Bybit");
  assert.equal(wallets.rows[1].emoji, "🟣");
  assert.equal(wallets.rows[3].account, "00799999004327338404");
  const channels = await db.query("select chat from channels order by sort");
  assert.deepEqual(channels.rows.map((r) => r.chat), ["@ft_H_N_O", "@CHNawaa"]);
  const digit = await db.query("select count(*)::int as c from products where price is null");
  assert.ok(digit.rows[0].c >= 40, `منتجات بدون سعر=${digit.rows[0].c}`);
});

await check("webhook: يرفض الطلبات بدون السر", async () => {
  const res = await sendUpdate(msg(users.buyer, "/start"), null);
  assert.equal(res.status, 401);
});

/* 1. الاشتراك الإجباري */
await check("start: بوابة الاشتراك الإجباري (أزرار القنوات)", async () => {
  await resetSent();
  await membership({ "@ft_H_N_O": "left", "@CHNawaa": "left" });
  await sendUpdate(msg(users.buyer, "/start"));
  const gate = await waitForMessage(555, (m) => (m.text ?? "").includes("الاشتراك إجباري"));
  assert.ok(hasButton(gate, "ft_H_N_O"));
  assert.ok(hasButton(gate, "CHNawaa"));
  assert.ok(hasButton(gate, "تحقق من الاشتراك"));
  const state = await mockState();
  assert.ok(!state.sent.some((m) => (m.text ?? "").includes("اختر القسم")), "يجب ألا تظهر القائمة قبل الاشتراك");
});

await check("chk: التحقق يفتح القائمة الرئيسية بعد الاشتراك", async () => {
  await membership({ "@ft_H_N_O": "member", "@CHNawaa": "member" });
  await resetSent();
  await sendUpdate(cb(users.buyer, "chk"));
  const menu = await waitForMessage(555, (m) => (m.text ?? "").includes("CHINWI STORE"));
  assert.ok(hasButton(menu, "شحن الألعاب الرقمية"));
  assert.ok(hasButton(menu, "شحن تليجرام بريموم"));
  assert.ok(hasButton(menu, "شحن عملات تيك توك"));
  assert.ok(hasButton(menu, "المنتجات الرقمية"));
  assert.ok(hasButton(menu, "بيع وشراء الدولار"));
  assert.ok(hasButton(menu, "الدعم الفني"));
  assert.ok(hasButton(menu, "طلباتي"));
});

await check("menu: زر الألعاب يفتح قائمة فري فاير و بيس", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "games"));
  const games = await waitForMessage(555, (m) => (m.text ?? "").includes("شحن الألعاب الرقمية"));
  assert.ok(hasButton(games, "فري فاير"));
  assert.ok(hasButton(games, "eFootball"));
});

await check("gate: الحساب المعفى @A_B_B_X_N يدخل بلا اشتراك", async () => {
  await membership({ "@ft_H_N_O": "left", "@CHNawaa": "left" });
  await resetSent();
  const exempt = { id: 777, is_bot: false, first_name: "Owner", username: "A_B_B_X_N", language_code: "ar" };
  await sendUpdate(msg(exempt, "/start"));
  await waitForMessage(777, (m) => (m.text ?? "").includes("اختر القسم"));
  const st = await mockState();
  assert.ok(!st.sent.some((m) => (m.text ?? "").includes("الاشتراك إجباري")), "لا بوابة للحساب المعفى");
});

await check("buttons: القائمة الرئيسية خضراء والدعم أحمر", async () => {
  await membership({ "@ft_H_N_O": "member", "@CHNawaa": "member" });
  await resetSent();
  await sendUpdate(msg({ id: 777, is_bot: false, first_name: "Owner", username: "A_B_B_X_N" }, "/start"));
  const menu = await waitForMessage(777, (m) => (m.text ?? "").includes("اختر القسم"));
  const btns = buttonsOf(menu);
  assert.ok(btns.some((x) => (x.text ?? "").includes("🎮") && x.style === "success"), "زر الألعاب أخضر");
  assert.ok(btns.some((x) => (x.text ?? "").includes("📞") && x.style === "danger"), "زر الدعم أحمر");
});

await check("gate: تظهر البوابة حتى لو تعذّر التحقق ثم تفتح بزر «تحققت»", async () => {
  await membership({ "@ft_H_N_O": "__error", "@CHNawaa": "__error" });
  await resetSent();
  await sendUpdate(msg(users.other, "/start"));
  const gate = await waitForMessage(999, (m) => (m.text ?? "").includes("الاشتراك إجباري"));
  assert.ok(hasButton(gate, "تحقق من الاشتراك"));
  const st = await mockState();
  assert.ok(!st.sent.some((m) => (m.text ?? "").includes("اختر القسم")), "لا تُفتح القائمة قبل التحقق");
  // المحاولة الأولى تُرفض (لا يمكن التحقق) — المحاولة الثانية تفتح
  await resetSent();
  await sendUpdate(cb(users.other, "chk"));
  await waitForMessage(999, (m) => (m.text ?? "").includes("الاشتراك إجباري"));
  await resetSent();
  await sendUpdate(cb(users.other, "chk"));
  const menu = await waitForMessage(999, (m) => (m.text ?? "").includes("CHINWI STORE"));
  assert.ok(hasButton(menu, "شحن الألعاب الرقمية"));
  await membership({ "@ft_H_N_O": "member", "@CHNawaa": "member" });
});

/* 2. تصفح القسم والمنتج */
const ff = (await db.query("select id from categories where slug = 'freefire'")).rows[0];
const product = (
  await db.query("select id, price from products where category_id = $1 and name like '%100 جوهرة%' limit 1", [ff.id])
).rows[0];

await check("category: يعرض العروض كأزرار مع الأسعار", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, `cat:${ff.id}`));
  const card = await waitForMessage(555, (m) => m.method === "sendPhoto" && (m.text ?? "").includes("فري فاير"));
  assert.ok(hasButton(card, "100 جوهرة"));
  assert.ok(hasButton(card, "320 دج"));
  assert.ok(card.photo, "يجب إرسال صورة القسم");
  assert.ok(hasButton(card, "فري فاير"), "هيدر القسم زر");
  const priceBtn = buttonsOf(card).find((x) => (x.text ?? "").startsWith("💰") && (x.text ?? "").includes("320 دج"));
  assert.ok(priceBtn, "زر السعر موجود");
  assert.equal(priceBtn.style, "danger", "زر السعر أحمر (danger)");
  const nameBtn = buttonsOf(card).find((x) => (x.text ?? "").startsWith("💎") && (x.text ?? "").includes("100 جوهرة"));
  assert.ok(nameBtn, "زر الاسم موجود");
  assert.equal(nameBtn.style, "success", "زر الاسم أخضر (success)");
});

await check("product: بطاقة المنتج + زر الشراء", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, `prd:${product.id}`));
  const card = await waitForMessage(555, (m) => (m.text ?? "").includes("100 جوهرة") && hasButton(m, "شراء الآن"));
  assert.ok(hasButton(card, "شراء الآن"));
  assert.ok(hasButton(card, "1210865168"), "أرقام محافظ المالك تظهر مع المنتج");
  assert.ok(hasButton(card, "1681967118"), "RedotPay يظهر مع المنتج");
  assert.ok((card.text ?? "").includes("الدفع إلى المالك"), "قسم الدفع في وصف المنتج");
});

await check("top: زر الأكثر مبيعاً يعرض العروض كأزرار [سعر|اسم]", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "top"));
  const top = await waitForMessage(555, (m) => (m.text ?? "").includes("الأكثر مبيعاً"));
  assert.ok(hasButton(top, "🏠"));
  assert.ok(buttonsOf(top).some((x) => (x.text ?? "").startsWith("💰")), "أزرار أسعار 💰");
  assert.ok(buttonsOf(top).some((x) => !(x.text ?? "").startsWith("💰") && !(x.text ?? "").startsWith("🏠")), "أزرار أسماء بإيموجي");
});

await check("search: زر البحث ثم كتابة اسم يظهر النتائج", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "search"));
  await waitForMessage(555, (m) => (m.text ?? "").includes("البحث في المتجر"));
  await resetSent();
  await sendUpdate(msg(users.buyer, "جوهرة"));
  const res = await waitForMessage(555, (m) => (m.text ?? "").includes("نتائج البحث"));
  assert.ok(buttonsOf(res).some((x) => (x.text ?? "").includes("جوهرة")));
});

/* 3. الشراء: حقل مطلوب → الدفع */
await check("buy: يطلب الآيدي ثم يعرض طرق الدفع", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, `buy:${product.id}`));
  await waitForMessage(555, (m) => (m.text ?? "").includes("آيدي اللاعب"));
  await sendUpdate(msg(users.buyer, "1234567890"));
  const pay = await waitForMessage(555, (m) => (m.text ?? "").includes("إتمام الدفع"));
  assert.ok(hasButton(pay, "Binance"));
  assert.ok(hasButton(pay, "RedotPay"));
  assert.ok(hasButton(pay, "Bybit"));
  assert.ok(hasButton(pay, "BaridiMob"));
  const order = (await db.query("select * from orders order by id desc limit 1")).rows[0];
  assert.equal(Number(order.amount), 320);
  assert.equal(order.status, "pending_payment");
  assert.equal(order.details["آيدي اللاعب (ID) في فري فاير"] ?? Object.values(order.details)[0], "1234567890");
});

const order1 = (await db.query("select * from orders order by id desc limit 1")).rows[0];

await check("wallet: تفاصيل المحفظة + زر نسخ العنوان", async () => {
  const wallet = (await db.query("select * from wallets where name like 'Binance%'")).rows[0];
  await resetSent();
  await sendUpdate(cb(users.buyer, `pw:${order1.id}:${wallet.id}`));
  const details = await waitForMessage(555, (m) => (m.text ?? "").includes("1210865168"));
  const copy = buttonsOf(details).find((b) => b.copy_text);
  assert.ok(copy, "زر النسخ مفقود");
  assert.equal(copy.copy_text.text, "1210865168");
  assert.ok(hasButton(details, "تم الدفع"));
});

/* 4. الإيصال + إشعار المالك */
await check("receipt: استلام الإيصال وإشعار المالك بأزرار القرار", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, `paid:${order1.id}`));
  await waitForMessage(555, (m) => (m.text ?? "").includes("أرسل الإيصال"));
  await sendUpdate(photoMsg(users.buyer));
  const confirm = await waitForMessage(555, (m) => (m.text ?? "").includes("تم استلام إيصالك"));
  assert.ok(confirm);
  const ownerMsg = await waitForMessage(777, (m) => m.method === "sendPhoto" && (m.text ?? "").includes("إيصال دفع جديد"));
  assert.ok(hasButton(ownerMsg, "قبول"));
  assert.ok(hasButton(ownerMsg, "رفض"));
  const row = (await db.query("select * from orders where id = $1", [order1.id])).rows[0];
  assert.equal(row.status, "awaiting_review");
  assert.equal(row.receipt_file_id, "receipt_big_1");
  assert.equal(row.payment_method, "Binance (USDT)");
});

/* 5. قبول المالك */
await check("approve: المالك يقبل → تسليم + إعلام الزبون + تحديث المبالغ", async () => {
  await resetSent();
  await sendUpdate(cb(users.owner, `apv:${order1.id}`));
  const done = await waitForMessage(555, (m) => (m.text ?? "").includes("تم تأكيد طلبك"));
  assert.ok(done);
  const row = (await db.query("select * from orders where id = $1", [order1.id])).rows[0];
  assert.equal(row.status, "delivered");
  const user = (await db.query("select total_spent, orders_count from users where tg_id = 555")).rows[0];
  assert.equal(Number(user.total_spent), 320);
  assert.ok(user.orders_count >= 1);
});

/* 6. بيع الدولار */
await check("usd: اختيار السعر → الكمية → الدفع → الإيصال", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "usd"));
  const intro = await waitForMessage(555, (m) => (m.text ?? "").includes("بيع الدولار"));
  assert.ok(hasButton(intro, "250"));
  assert.ok(hasButton(intro, "255"));
  await sendUpdate(cb(users.buyer, "usdr:255"));
  await waitForMessage(555, (m) => (m.text ?? "").includes("أرسل الكمية"));
  await sendUpdate(msg(users.buyer, "10"));
  const pay = await waitForMessage(555, (m) => (m.text ?? "").includes("إتمام الدفع"));
  assert.ok((pay.text ?? "").includes("2,550"), "المبلغ المتوقع 2550");
  const order = (await db.query("select * from orders where kind = 'usd' order by id desc limit 1")).rows[0];
  assert.equal(Number(order.amount), 2550);
  assert.equal(Number(order.usd_amount), 10);
  assert.equal(Number(order.rate), 255);
  await sendUpdate(cb(users.buyer, `paid:${order.id}`));
  await waitForMessage(555, (m) => (m.text ?? "").includes("أرسل الإيصال"));
  await sendUpdate(photoMsg(users.buyer));
  const ownerMsg = await waitForMessage(777, (m) => (m.text ?? "").includes("10$"));
  assert.ok(ownerMsg);
});

/* 7. الدعم والرسائل */
await check("support: رسالة الزبون تصل للمالك مع /reply", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "msgowner"));
  await waitForMessage(555, (m) => (m.text ?? "").includes("اكتب رسالتك"));
  await sendUpdate(msg(users.buyer, "سلام، بخصوص طلبي رقم CH-1"));
  const toOwner = await waitForMessage(777, (m) => (m.text ?? "").includes("رسالة من زبون"));
  assert.ok((toOwner.text ?? "").includes("سلام، بخصوص"));
  await sendUpdate(msg(users.owner, "/reply 555 تم الرد على استفسارك"));
  const reply = await waitForMessage(555, (m) => (m.text ?? "").includes("رسالة من إدارة المتجر"));
  assert.ok((reply.text ?? "").includes("تم الرد"));
});

await check("orders: زر طلباتي يعرض الطلبات وحالاتها", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "orders"));
  const list = await waitForMessage(555, (m) => (m.text ?? "").includes("طلباتي"));
  assert.ok((list.text ?? "").includes("CH-"));
});

/* 8. الحظر والإدارة */
await check("admin: مستخدم عادي لا يفتح لوحة البوت", async () => {
  await resetSent();
  await sendUpdate(msg(users.buyer, "/admin"));
  const denied = await waitForMessage(555, (m) => (m.text ?? "").includes("للمالك فقط"));
  assert.ok(denied);
});

await check("admin: المالك يفتح لوحة البوت", async () => {
  await resetSent();
  await sendUpdate(msg(users.owner, "/admin"));
  const panel = await waitForMessage(777, (m) => (m.text ?? "").includes("لوحة تحكم البوت"));
  assert.ok(hasButton(panel, "الإيصالات المعلّقة"));
  assert.ok(hasButton(panel, "إحصائيات"));
  assert.ok(hasButton(panel, "معاينة بوابة الاشتراك"));
});

await check("admin: أزرار اللوحة تفتح صفحاتها (إيصالات/إحصائيات/معاينة البوابة)", async () => {
  await resetSent();
  await sendUpdate(cb(users.owner, "adm:pending"));
  await waitForMessage(777, (m) => (m.text ?? "").includes("بانتظار المراجعة") || (m.text ?? "").includes("لا توجد إيصالات"));
  await resetSent();
  await sendUpdate(cb(users.owner, "adm:stats"));
  await waitForMessage(777, (m) => (m.text ?? "").includes("إحصائيات المتجر"));
  await resetSent();
  await sendUpdate(cb(users.owner, "adm:gateprev"));
  const gate = await waitForMessage(777, (m) => (m.text ?? "").includes("الاشتراك إجباري"));
  assert.ok(hasButton(gate, "تحقق من الاشتراك"));
});

await check("ban: الحظر يمنع الزبون من الاستخدام", async () => {
  // إنشاء المستخدم أولاً ثم حظره
  await sendUpdate(msg(users.other, "/help"));
  await db.query(
    "insert into users (tg_id, first_name, username, is_blocked) values (999, 'زائر', 'guest_dz', true) on conflict (tg_id) do update set is_blocked = true",
  );
  await resetSent();
  await sendUpdate(msg(users.other, "/start"));
  await sleep(1200);
  const state = await mockState();
  assert.equal(state.sent.filter((m) => m.chat_id === 999).length, 0);
  await db.query("update users set is_blocked = false where tg_id = 999");
});

/* 9. لوحة التحكم (API) */
let cookie = "";
await check("login: كلمة سر خاطئة مرفوضة", async () => {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong-pass" }),
  });
  assert.equal(res.status, 401);
});

await check("login: كلمة السر الصحيحة تفتح جلسة", async () => {
  const res = await fetch(`${BASE}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "TestPass123" }),
  });
  assert.equal(res.status, 200);
  const raw = res.headers.get("set-cookie") || "";
  cookie = raw.split(";")[0];
  assert.ok(cookie.startsWith("chinwi_admin="));
});

const adminGet = (path) => fetch(`${BASE}/api/admin/${path}`, { headers: { cookie } });
const adminPost = (path, body) =>
  fetch(`${BASE}/api/admin/${path}`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });

await check("api: لوحة القيادة تعيد إحصاءات وطلبات", async () => {
  const data = await adminGet("dashboard").then((r) => r.json());
  assert.ok(data.stats.users >= 3, `users=${data.stats.users}`);
  assert.ok(data.stats.orders >= 2);
  assert.ok(Array.isArray(data.orders));
});

await check("api: بدون كوكي = 401", async () => {
  const res = await fetch(`${BASE}/api/admin/dashboard`);
  assert.equal(res.status, 401);
});

await check("api: الطلبات والبحث", async () => {
  const data = await adminGet("orders?status=all&limit=10").then((r) => r.json());
  assert.ok(data.rows.length >= 2);
  const search = await adminGet(`orders?search=${order1.code}`).then((r) => r.json());
  assert.equal(search.rows[0].code, order1.code);
});

await check("api: المستخدمون مع الصور والفلترة", async () => {
  const data = await adminGet("users?filter=all&limit=10").then((r) => r.json());
  assert.ok(data.rows.some((u) => u.tg_id === "555"));
  const banned = await adminGet("users?filter=buyers").then((r) => r.json());
  assert.ok(banned.rows.length >= 1);
});

await check("api: قبول/رفض طلب من اللوحة يغيّر الحالة", async () => {
  const pending = (await db.query("select id from orders where kind='usd' order by id desc limit 1")).rows[0];
  const res = await adminPost(`orders/${pending.id}`, { status: "rejected", adminNote: "إيصال غير واضح" }).then((r) => r.json());
  assert.equal(res.order.status, "rejected");
  const user = await waitForMessage(555, (m) => (m.text ?? "").includes("تم رفض طلبك"));
  assert.ok((user.text ?? "").includes("إيصال غير واضح"));
});

await check("api: CRUD منتجات كامل", async () => {
  const cats = await adminGet("categories").then((r) => r.json());
  const catId = cats.categories[0].id;
  const created = await adminPost("products", { name: "منتج اختبار", price: 1500, category_id: catId }).then((r) => r.json());
  assert.ok(created.product.id);
  const updated = await adminPost(`products/${created.product.id}`, { price: 1800, badge: "جديد" }).then((r) => r.json());
  assert.equal(Number(updated.product.price), 1800);
  const del = await adminPost(`products/${created.product.id}/delete`).then((r) => r.json());
  assert.equal(del.ok, true);
});

await check("api: تعديل أسعار جماعي", async () => {
  const before = (await db.query("select price from products where id = $1", [product.id])).rows[0].price;
  const res = await adminPost("products/bulk", { percent: 10, category_id: ff.id }).then((r) => r.json());
  assert.ok(res.count > 0);
  const after = (await db.query("select price from products where id = $1", [product.id])).rows[0].price;
  assert.equal(Number(after), Math.round(Number(before) * 1.1));
  await adminPost("products/bulk", { percent: -9.0909, category_id: ff.id });
});

await check("api: محافظ وقنوات وأقسام", async () => {
  const w = await adminPost("wallets", { name: "محفظة اختبار", account: "000111", emoji: "🟣" }).then((r) => r.json());
  assert.ok(w.wallet.id);
  await adminPost(`wallets/${w.wallet.id}`, { active: false });
  await adminPost(`wallets/${w.wallet.id}/delete`);
  const ch = await adminPost("channels", { chat: "@test_channel" }).then((r) => r.json());
  assert.ok(ch.channel.url.includes("t.me/test_channel"));
  const test = await adminPost(`channels/${ch.channel.id}/test`, { chat: "@test_channel" }).then((r) => r.json());
  assert.equal(test.ok, true);
  await adminPost(`channels/${ch.channel.id}/delete`);
  const c = await adminPost("categories", { name: "قسم اختبار", emoji: "🧪", section: "services" }).then((r) => r.json());
  assert.ok(c.category.id);
  await adminPost(`categories/${c.category.id}/delete`);
});

await check("api: القنوات معطّلة → البوت يسمح بالدخول", async () => {
  await adminPost("settings", { require_subscription: false });
  await membership({ "@ft_H_N_O": "left", "@CHNawaa": "left" });
  await resetSent();
  await sendUpdate(msg(users.other, "/start"));
  const menu = await waitForMessage(999, (m) => (m.text ?? "").includes("CHINWI STORE"));
  assert.ok(hasButton(menu, "شحن الألعاب الرقمية"));
  await adminPost("settings", { require_subscription: true });
});

await check("api: صيانة تمنع الزبائن", async () => {
  await adminPost("settings", { maintenance: true });
  await resetSent();
  await sendUpdate(msg(users.other, "/start"));
  const notice = await waitForMessage(999, (m) => (m.text ?? "").includes("صيانة"));
  assert.ok(notice);
  await adminPost("settings", { maintenance: false });
});

await check("api: إعدادات + كلمة سر", async () => {
  const s = await adminGet("settings").then((r) => r.json());
  assert.equal(typeof s.settings.store_name, "string");
  assert.equal(s.settings.admin_password, undefined, "لا يجب تسريب كلمة السر");
  const bad = await adminPost("password", { current: "nope", next: "abcdef" });
  assert.equal(bad.status, 401);
});

await check("api: نسخة احتياطية JSON و SQL", async () => {
  const json = await fetch(`${BASE}/api/admin/export/backup`, { headers: { cookie } }).then((r) => r.json());
  assert.ok(json.tables && Array.isArray(json.tables.products), "جداول JSON");
  assert.ok(json.tables.products.length >= 70);
  assert.ok(json.counts.wallets >= 4);
  const sql = await fetch(`${BASE}/api/admin/export/sql`, { headers: { cookie } }).then((r) => r.text());
  assert.ok(sql.includes("INSERT INTO products"));
  assert.ok(sql.includes("INSERT INTO settings"));
});

await check("api: تصدير CSV للطلبات", async () => {
  const res = await adminGet("export/orders");
  const text = await res.text();
  assert.ok(text.includes("code,date,user_id"));
  assert.ok(text.includes(order1.code));
});

await check("api: ربط الويبهوك يضبط الرابط الصحيح", async () => {
  const res = await adminPost("setup").then((r) => r.json());
  assert.equal(res.ok, true);
  const state = await mockState();
  assert.equal(state.webhookUrl, `${BASE}/api/telegram/webhook`);
});

await check("api: الإيموجي المتحرك (استيراد + تعطيل)", async () => {
  const sync = await adminPost("emoji/sync", { set: "addemoji/MockSet" }).then((r) => r.json());
  assert.equal(sync.ok, true);
  assert.ok(sync.count >= 2);
  const off = await adminPost("emoji/toggle", { enabled: false }).then((r) => r.json());
  assert.equal(off.enabled, false);
  // البوت يجب أن يستمر بالعمل بعد التعطيل
  await resetSent();
  await sendUpdate(msg(users.other, "/help"));
  await waitForMessage(999, (m) => (m.text ?? "").includes("المساعدة"));
});

await check("api: الذكاء الاصطناعي بدون مفاتيح يعطي خطأ واضح", async () => {
  const res = await adminPost("ai/chat", { text: "كم مبيعاتي؟" });
  assert.equal(res.status, 502);
});

await check("api: إرسال رسالة لمستخدم من اللوحة", async () => {
  await resetSent();
  const res = await adminPost(`users/555`, { action: "message", text: "مرحباً من الإدارة" }).then((r) => r.json());
  assert.equal(res.ok, true);
  await waitForMessage(555, (m) => (m.text ?? "").includes("مرحباً من الإدارة"));
});

await check("api: إذاعة جماعية تصل للجميع", async () => {
  await resetSent();
  const res = await adminPost("broadcast", { text: "🎉 عرض خاص اليوم" }).then((r) => r.json());
  assert.ok(res.sent >= 3);
  await waitForMessage(555, (m) => (m.text ?? "").includes("عرض خاص اليوم"));
  await waitForMessage(777, (m) => (m.text ?? "").includes("عرض خاص اليوم"));
});

/* 10. الصفحات */
await check("pages: الجذر يحوّل مباشرة إلى البوت (لا موقع مصغّر)", async () => {
  const res = await fetch(BASE, { redirect: "manual" });
  assert.ok([307, 302, 308].includes(res.status), `status=${res.status}`);
  const loc = res.headers.get("location") ?? "";
  assert.ok(loc.includes("t.me/"), `location=${loc}`);
});

await check("pages: لوحة التحكم تحمي الصفحات", async () => {
  const res = await fetch(`${BASE}/admin`, { redirect: "manual" });
  assert.ok([307, 302, 308].includes(res.status), `status=${res.status}`);
  const login = await fetch(`${BASE}/admin/login`);
  assert.equal(login.status, 200);
});

await check("pages: صفحة الطلبات تعمل مع الجلسة", async () => {
  const res = await fetch(`${BASE}/admin/orders`, { headers: { cookie } });
  assert.equal(res.status, 200);
});

/* النتيجة */
await db.end();
console.log(`\n${"─".repeat(60)}`);
console.log(`النتيجة: ${passed} ✅ / ${failures.length} ❌`);
if (failures.length) {
  for (const f of failures) console.log(`\n❌ ${f.name}\n${f.err.stack}`);
  process.exit(1);
}
console.log("🎉 كل الاختبارات ناجحة");
