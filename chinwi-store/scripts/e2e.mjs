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
await db.query("UPDATE settings SET value = 'false'::jsonb WHERE key = 'bot_locked'");
// الاختبار يرسل عشرات الرسائل في دقيقة واحدة — نرفع حدّ المعدّل أثناءه فقط
await db.query("UPDATE settings SET value = '500'::jsonb WHERE key = 'rate_limit_per_min'");
await db.query("DELETE FROM security_events");
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
  assert.ok(slugs.includes("other-games"), "other-games");
  assert.ok(slugs.includes("giftcards"), "giftcards");
  // طرق الدفع النشطة: Binance / RedotPay / Bybit / BaridiMob (Flexy مخفي فقط)
  const wallets = await db.query("select name, account, emoji from wallets where active = true order by sort");
  assert.equal(wallets.rowCount, 4);
  assert.equal(wallets.rows[0].account, "1210865168");
  assert.equal(wallets.rows[0].name, "Binance (USDT)");
  assert.equal(wallets.rows[1].name, "RedotPay");
  assert.equal(wallets.rows[1].emoji, "🟣");
  assert.equal(wallets.rows[2].name, "Bybit");
  assert.equal(wallets.rows[3].name, "BaridiMob");
  assert.equal(wallets.rows[3].account, "00799999004327338404");
  const hidden = await db.query("select lower(name) as n, active from wallets");
  const byName = Object.fromEntries(hidden.rows.map((r) => [r.n, r.active]));
  assert.ok(!("flexy" in byName) || byName["flexy"] === false, "Flexy مخفي");
  assert.equal(byName["baridimob"], true, "BaridiMob ظاهر");
  // بوسترات الألعاب الـ12 كلها مربوطة (Minecraft + Stumble اكتملا أخيراً)
  const gameCats = await db.query("select slug, image_url from categories where section = 'games' order by slug");
  const bySlug = Object.fromEntries(gameCats.rows.map((r) => [r.slug, r.image_url]));
  assert.equal(bySlug.minecraft, "/catalog/games/minecraft-poster.jpg");
  assert.equal(bySlug.stumble, "/catalog/games/stumble-poster.jpg");
  for (const slug of ["pubg", "codm", "fcmobile", "fortnite", "coc", "brawl", "clashroyale", "roblox", "genshin", "mlbb"]) {
    assert.ok(String(bySlug[slug] ?? "").endsWith("-poster.jpg"), `${slug}=${bySlug[slug]}`);
  }
  const channels = await db.query("select chat from channels order by sort");
  assert.deepEqual(channels.rows.map((r) => r.chat), ["@chinwichi", "@ft_H_N_O", "@CHNawaa", "@C_2_2_H"]);
  const prizes = await db.query("select title, points from prizes order by points");
  assert.ok(prizes.rowCount >= 4, `جوائز=${prizes.rowCount}`);
  const cheap = prizes.rows.find((r) => String(r.title).includes("وساطة"));
  assert.equal(Number(cheap?.points), 20);
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
  await membership({ "@chinwichi": "left", "@ft_H_N_O": "left", "@CHNawaa": "left", "@C_2_2_H": "left" });
  await sendUpdate(msg(users.buyer, "/start"));
  const gate = await waitForMessage(555, (m) => (m.text ?? "").includes("الاشتراك إجباري"));
  assert.ok(hasButton(gate, "ft_H_N_O"));
  assert.ok(hasButton(gate, "CHNawaa"));
  assert.ok(hasButton(gate, "CHINWICHI"));
  assert.ok(hasButton(gate, "C_2_2_H"));
  assert.ok(hasButton(gate, "تحقق من الاشتراك"));
  const state = await mockState();
  assert.ok(!state.sent.some((m) => (m.text ?? "").includes("اختر القسم")), "يجب ألا تظهر القائمة قبل الاشتراك");
});

await check("chk: التحقق يفتح القائمة الرئيسية بعد الاشتراك", async () => {
  await membership({ "@chinwichi": "member", "@ft_H_N_O": "member", "@CHNawaa": "member", "@C_2_2_H": "member" });
  await resetSent();
  await sendUpdate(cb(users.buyer, "chk"));
  const menu = await waitForMessage(555, (m) => (m.text ?? "").includes("CHINWI STORE"));
  assert.ok(hasButton(menu, "شحن الألعاب الرقمية"));
  assert.ok(hasButton(menu, "المسابقات"));
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
  // التقسيم إلى ثلاثة أقسام ملوّنة: أخضر (آي دي) / أزرق (بالحساب) / أحمر (بطاقات)
  assert.ok(hasButton(games, "شحن بالآي دي"));
  assert.ok(hasButton(games, "شحن بالحساب"));
  assert.ok(hasButton(games, "بطاقات وأقسام خاصة"));
  const all = (games.reply_markup?.inline_keyboard ?? []).flat();
  const idHeader = all.find((btn) => (btn.text ?? "").includes("شحن بالآي دي"));
  const accHeader = all.find((btn) => (btn.text ?? "").includes("شحن بالحساب"));
  const cardHeader = all.find((btn) => (btn.text ?? "").includes("بطاقات"));
  assert.equal(idHeader?.style, "success");
  assert.equal(accHeader?.style, "primary");
  assert.equal(cardHeader?.style, "danger");
  const pesBtn = all.find((btn) => (btn.text ?? "").includes("eFootball"));
  const ffBtn = all.find((btn) => (btn.text ?? "").includes("فري فاير"));
  assert.equal(pesBtn?.style, "primary");
  assert.equal(ffBtn?.style, "success");
});

await check("gate: الحساب المعفى @A_B_B_X_N يدخل بلا اشتراك", async () => {
  await membership({ "@chinwichi": "left", "@ft_H_N_O": "left", "@CHNawaa": "left", "@C_2_2_H": "left" });
  await resetSent();
  const exempt = { id: 777, is_bot: false, first_name: "Owner", username: "A_B_B_X_N", language_code: "ar" };
  await sendUpdate(msg(exempt, "/start"));
  await waitForMessage(777, (m) => (m.text ?? "").includes("اختر القسم"));
  const st = await mockState();
  assert.ok(!st.sent.some((m) => (m.text ?? "").includes("الاشتراك إجباري")), "لا بوابة للحساب المعفى");
});

await check("buttons: القائمة الرئيسية خضراء والدعم أحمر", async () => {
  await membership({ "@chinwichi": "member", "@ft_H_N_O": "member", "@CHNawaa": "member", "@C_2_2_H": "member" });
  await resetSent();
  await sendUpdate(msg({ id: 777, is_bot: false, first_name: "Owner", username: "A_B_B_X_N" }, "/start"));
  const menu = await waitForMessage(777, (m) => (m.text ?? "").includes("اختر القسم"));
  const btns = buttonsOf(menu);
  assert.ok(btns.some((x) => (x.text ?? "").includes("🎮") && x.style === "success"), "زر الألعاب أخضر");
  assert.ok(btns.some((x) => (x.text ?? "").includes("📞") && x.style === "danger"), "زر الدعم أحمر");
});

await check("gate: تظهر البوابة حتى لو تعذّر التحقق ثم تفتح بزر «تحققت»", async () => {
  await membership({ "@chinwichi": "__error", "@ft_H_N_O": "__error", "@CHNawaa": "__error", "@C_2_2_H": "__error" });
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
  await membership({ "@chinwichi": "member", "@ft_H_N_O": "member", "@CHNawaa": "member", "@C_2_2_H": "member" });
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
  assert.ok(hasButton(pay, "BaridiMob"), "BaridiMob ظاهر");
  assert.ok(!hasButton(pay, "Flexy"), "Flexy مخفي");
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
  assert.ok(hasButton(intro, "243"));
  assert.ok(hasButton(intro, "310 دج (فليكسي)"));
  const pes = await db.query("select p.name, p.fields, p.price, p.price_label, p.badge, p.description from products p join categories c on c.id = p.category_id where c.slug = 'efootball'");
  assert.ok(pes.rowCount > 0);
  for (const row of pes.rows) {
    const keys = (row.fields ?? []).map((f) => f.key);
    assert.ok(keys.includes("account") && keys.includes("password"), `${row.name} بالحساب`);
    assert.ok(!keys.includes("player_id"), `${row.name} بدون آيدي`);
    assert.ok(Number(row.price) > 0, `${row.name} سعره ظاهر عادي`);
    assert.ok(!row.price_label || row.price_label !== "تواصل مع المالك", `${row.name} سعر عادي بلا «تواصل مع المالك»`);
    assert.equal(row.badge, "شحن بالحساب");
  }
  await sendUpdate(cb(users.buyer, "usdr:243"));
  await waitForMessage(555, (m) => (m.text ?? "").includes("أرسل الكمية"));
  await sendUpdate(msg(users.buyer, "10"));
  const pay = await waitForMessage(555, (m) => (m.text ?? "").includes("إتمام الدفع"));
  assert.ok((pay.text ?? "").includes("2,430"), "المبلغ المتوقع 2430 (السوق السوداء)");
  const order = (await db.query("select * from orders where kind = 'usd' order by id desc limit 1")).rows[0];
  assert.equal(Number(order.amount), 2430);
  assert.equal(Number(order.usd_amount), 10);
  assert.equal(Number(order.rate), 243);
  await sendUpdate(cb(users.buyer, `paid:${order.id}`));
  await waitForMessage(555, (m) => (m.text ?? "").includes("أرسل الإيصال"));
  await sendUpdate(photoMsg(users.buyer));
  const ownerMsg = await waitForMessage(777, (m) => (m.text ?? "").includes("10$"));
  assert.ok(ownerMsg);
});

/* 6b. شراء شحن بالحساب — بلا كلمة سر فالبوت */
await check("buy: شحن بالحساب → تواصل مباشر مع المالك + المالك توصله طلبية", async () => {
  await resetSent();
  const pes = await db.query(
    "select p.id, p.name from products p join categories c on c.id = p.category_id where c.slug = 'efootball' and p.active = true order by p.id limit 1",
  );
  assert.ok(pes.rowCount > 0, "منتجات pes/efootball موجودة");
  const pesProduct = pes.rows[0];
  await sendUpdate(cb(users.buyer, `buy:${pesProduct.id}`));
  // 1) لا يسأل البوت على كلمة السر — مباشرة «إتمام الدفع»
  const pay = await waitForMessage(555, (m) => (m.text ?? "").includes("إتمام الدفع"));
  assert.ok(!((pay.text ?? "").includes("الخطوة")), "ما يسألش على كلمة السر");
  // 2) الزبون يوصله «تواصل مع المالك مباشرة» فقط — بلا كلمة سر ولا اسم حساب ولا بوت تواصل
  const dash = await waitForMessage(555, (m) => (m.text ?? "").includes("تواصل مع المالك"));
  assert.ok(hasButton(dash, "تواصل مع المالك"), "زر تواصل مع المالك ظاهر");
  assert.ok(!((dash.text ?? "").includes("الخطوة")), "لا أسئلة كلمة سر");
  assert.ok(!((dash.text ?? "").includes("بوت تواصل")), "ما فيش توجيه لبوت تواصل");
  // 3) الطلب انخلق بدون أي بيانات حساب
  const order = (await db.query("select * from orders where product_id = $1 order by id desc limit 1", [pesProduct.id])).rows[0];
  assert.ok(order, "انخلق طلب");
  assert.deepEqual(order.details ?? {}, {}, "الطلب بدون كلمة السر/اسم الحساب");
  // 4) المالك توصله طلبية فوراً بها كود الطلب
  const ownerMsg = await waitForMessage(777, (m) => (m.text ?? "").includes(order.code));
  assert.ok((ownerMsg.text ?? "").includes("طلب جديد"), "المالك توصله طلبية");
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
  await membership({ "@chinwichi": "left", "@ft_H_N_O": "left", "@CHNawaa": "left", "@C_2_2_H": "left" });
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

await check("api: الذكاء الاصطناعي لا يرفض أبداً (يسقط للعقل المحلي)", async () => {
  const res = await adminPost("ai/chat", { text: "كم مبيعاتي؟" });
  assert.equal(res.status, 200, `status=${res.status}`);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(String(json.reply).length > 10, "رد مفيد");
  assert.ok(["local", "groq", "gemini", "openrouter"].includes(json.provider), `provider=${json.provider}`);
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

/* 9. لوحة التحكم الشاملة: صفحات وميزات جديدة */
await check("dashboard: صفحات جديدة تعمل مع الجلسة", async () => {
  for (const page of ["security", "gate", "coupons", "faq", "reviews", "tasks", "analytics", "health", "backup"]) {
    const res = await fetch(`${BASE}/admin/${page}`, { headers: { cookie } });
    assert.equal(res.status, 200, `/${page} → ${res.status}`);
  }
});

await check("api: مركز الحماية يرجع الإعدادات والأحداث", async () => {
  const res = await adminGet("security");
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(json.settings, "settings موجودة");
  assert.ok(Array.isArray(json.events), "events مصفوفة");
  assert.ok("rate_limit_per_min" in json.settings, "حد المعدّل موجود");
});

await check("api: قفل البوت يوقف كل الرسائل غير الإدارية", async () => {
  await adminPost("security/lock");
  await sleep(400);
  await membership({ "@chinwichi": "member", "@ft_H_N_O": "member", "@CHNawaa": "member", "@C_2_2_H": "member" });
  await resetSent();
  await sendUpdate(msg(users.buyer, "/start"));
  const locked = await waitForMessage(555, (m) => (m.text ?? "").includes("صيانة") || (m.text ?? "").includes("قفل"));
  assert.ok(locked, "رسالة القفل وصلت");
  await adminPost("security/unlock");
});

await check("api: كلمات ممنوعة تحظر بعد تكرار المخالفة", async () => {
  await adminPost("security/save", { block_words: ["سبام_تجريبي"], auto_block_after: 2 });
  await db.query("DELETE FROM security_events WHERE user_id = 999");
  await db.query("UPDATE users SET is_blocked = false WHERE tg_id = 999");
  await resetSent();
  await sendUpdate(msg(users.other, "سبام_تجريبي"));
  const warn = await waitForMessage(999, (m) => (m.text ?? "").includes("كلمة غير مسموحة"));
  assert.ok(warn);
  await sendUpdate(msg(users.other, "سبام_تجريبي مرة أخرى"));
  await sleep(1200);
  const blocked = await db.query("select is_blocked from users where tg_id = 999");
  assert.equal(blocked.rows[0]?.is_blocked, true, "تم الحظر التلقائي");
  await db.query("update users set is_blocked = false where tg_id = 999");
  await adminPost("security/save", { block_words: [] });
});

await check("api: أكواد الخصم CRUD + أمر /coupon في البوت", async () => {
  const created = await adminPost("coupons", { code: "E2E10", kind: "percent", amount: 10, max_uses: 5 });
  assert.equal(created.status, 200);
  const list = await adminGet("coupons").then((r) => r.json());
  assert.ok(list.rows.some((c) => c.code === "E2E10"), "الكود موجود");
  await resetSent();
  await sendUpdate(msg(users.buyer, "/coupon E2E10"));
  const ok = await waitForMessage(555, (m) => (m.text ?? "").includes("تم تفعيل الكود"));
  assert.ok(ok, "تم تفعيل الكود في البوت");
  await resetSent();
  await sendUpdate(msg(users.buyer, "/coupon WRONGCODE"));
  const bad = await waitForMessage(555, (m) => (m.text ?? "").includes("غير صالح"));
  assert.ok(bad, "الكود الخاطئ مرفوض");
  const id = list.rows.find((c) => c.code === "E2E10").id;
  await adminPost(`coupons/${id}/delete`);
});

await check("api: الأسئلة الشائعة تُدار وتظهر بأمر /faq", async () => {
  await adminPost("faq", { question: "وقت الشحن؟", answer: "من 5 إلى 30 دقيقة", sort: 1 });
  const list = await adminGet("faq").then((r) => r.json());
  assert.ok(list.rows.some((r) => r.question === "وقت الشحن؟"));
  await resetSent();
  await sendUpdate(msg(users.buyer, "/faq"));
  const shown = await waitForMessage(555, (m) => (m.text ?? "").includes("وقت الشحن؟"));
  assert.ok(shown, "السؤال ظهر في البوت");
});

await check("api: التقييمات تُعتمد وتظهر بأمر /reviews", async () => {
  await adminPost("reviews", { name: "أمين", rating: 5, body: "خدمة سريعة جداً", approved: true });
  const list = await adminGet("reviews").then((r) => r.json());
  assert.ok(list.rows.some((r) => r.body === "خدمة سريعة جداً"));
  await resetSent();
  await sendUpdate(msg(users.buyer, "/reviews"));
  const shown = await waitForMessage(555, (m) => (m.text ?? "").includes("خدمة سريعة جداً"));
  assert.ok(shown, "التقييم ظهر في البوت");
});

await check("api: المهام تُضاف وتُنجز", async () => {
  const add = await adminPost("tasks", { title: "تحديث أسعار فري فاير" });
  assert.equal(add.status, 200);
  const list = await adminGet("tasks").then((r) => r.json());
  const task = list.rows.find((t) => t.title === "تحديث أسعار فري فاير");
  assert.ok(task, "المهمة موجودة");
  await adminPost(`tasks/${task.id}/toggle`);
  const after = await adminGet("tasks").then((r) => r.json());
  assert.equal(after.rows.find((t) => t.id === task.id).done, true, "أُنجزت");
  await adminPost(`tasks/${task.id}/delete`);
});

await check("api: التحليلات وصحة النظام ترجع بيانات حقيقية", async () => {
  const analytics = await adminGet("analytics?days=30").then((r) => r.json());
  assert.equal(analytics.ok, true);
  assert.ok(Array.isArray(analytics.series) && analytics.series.length >= 30, "سلسلة زمنية");
  assert.ok(analytics.top, "أفضل المنتجات");
  const health = await adminGet("health").then((r) => r.json());
  assert.equal(health.db.connected, true);
  assert.ok(health.counts.products > 0);
  assert.equal(typeof health.ai.gemini, "boolean", "حالة مزوّدي AI");
});

await check("api: بوابة الاشتراك ترجع القنوات والإعفاءات", async () => {
  const gate = await adminGet("gate").then((r) => r.json());
  assert.ok(gate.channels.length >= 2);
  assert.ok(String(gate.settings.gate_bypass).includes("A_B_B_X_N"));
});

await check("dashboard: صفحات AI والأدوات والنشاط تُفتح", async () => {
  for (const page of ["keys", "activity", "prompts", "search", "tools", "media"]) {
    const res = await fetch(`${BASE}/admin/${page}`, { headers: { cookie } });
    assert.equal(res.status, 200, `/${page} → ${res.status}`);
  }
});

await check("ai: العقل المحلي ينفّذ الأمر بدون مفاتيح إنترنت", async () => {
  const res = await adminPost("ai/local", { text: "أضف منتج 9999 جوهرة بسعر 8800 في فري فاير" });
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.provider, "local");
  assert.ok(json.actions.some((a) => a.type === "create_product"), "خطة إضافة منتج");
  const chat = await adminPost("ai/chat", { text: "أضف منتج 8888 جوهرة بسعر 7700 في فري فاير" });
  const chatJson = await chat.json();
  assert.equal(chatJson.ok, true, "الدردشة لا ترفض أبداً");
  assert.ok(typeof chatJson.reply === "string" && chatJson.reply.length > 10, "رد غير فارغ");
});

await check("ai: المهندس AI يقرأ كود البوت ويكشف حالة GitHub", async () => {
  const list = await adminGet("ai-code?action=list").then((r) => r.json());
  assert.equal(list.ok, true);
  assert.ok(Array.isArray(list.manifest) && list.manifest.length >= 50, "خريطة الكود محمّلة");
  assert.ok(list.manifest.some((f) => f.path === "src/lib/bot.ts"), "ملف البوت موجود في الخريطة");
  const status = await adminGet("ai-code?action=status").then((r) => r.json());
  assert.equal(status.ok, true);
  assert.equal(typeof status.github_token, "boolean");
  const file = await adminGet(`ai-code?action=file&path=${encodeURIComponent("package.json")}`).then((r) => r.json());
  assert.equal(file.ok, true);
  assert.ok(file.content.includes("chinwi-store"), "قراءة ملف حقيقي");
  const plan = await adminPost("ai-code", { action: "plan", request: "" }).then((r) => r.json());
  assert.equal(plan.ok, false, "طلب فارغ يُرفض بأدب");
});

await check("ai: مفاتيح المالك تُحفظ وتُختبر", async () => {
  const before = await adminGet("ai/status").then((r) => r.json());
  assert.equal(typeof before.providers.groq, "boolean");
  const save = await adminPost("ai/keys", { groq: "gsk_test_invalid_key_123456" });
  const json = await save.json();
  assert.equal(json.ok, true);
  assert.ok(json.results && typeof json.results.groq === "object", "نتيجة الفحص موجودة");
  assert.equal(json.results.groq.ok, false, "المفتاح الوهمي يُكشف");
  await adminPost("ai/keys", { groq: "" });
});

await check("ai: تنفيذ فعلي فوري بدون زر (لا قبول وهمي)", async () => {
  const name = `فحص تنفيذ ${Date.now() % 100000}`;
  const res = await adminPost("ai/chat", { text: `أضف منتج ${name} بسعر 777 في فري فاير` });
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(Array.isArray(json.results) && json.results.length > 0, "العمليات نُفّذت وأُعيدت نتائجها");
  assert.ok(json.results.some((r) => r.ok), "عملية ناجحة على الأقل");
  const products = await adminGet("products?limit=100").then((r) => r.json());
  const found = (products.products ?? products.rows ?? []).some((p) => String(p.name).includes(name));
  assert.ok(found, "المنتج موجود فعلاً في قاعدة البيانات");
});

await check("ai: المزوّدات المجانية بلا مفاتيح مفحوصة فعلياً", async () => {
  const json = await adminGet("ai/test").then((r) => r.json());
  assert.equal(json.ok === true || json.ok === false, true, "الفحص يعمل");
  assert.ok(json.free && typeof json.free === "object", "قسم المزوّدات المجانية موجود");
  assert.ok(Object.keys(json.free).length >= 3, "على الأقل 3 مزوّدات مجانية");
  assert.ok(Array.isArray(json.freeList), "قائمة المزوّدات");
  for (const row of Object.values(json.free)) assert.equal(typeof row.ok, "boolean");
});

await check("api: /api/ai/probe محمي بالكلمة السرية", async () => {
  const anon = await fetch(`${BASE}/api/ai/probe`);
  assert.equal(anon.status, 401, "بلا كلمة سرية = 401");
  const res = await fetch(`${BASE}/api/ai/probe?k=${encodeURIComponent("TestPass123")}`);
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.ok === true || json.ok === false, true);
  assert.ok(json.free && json.freeList, "تفاصيل المزوّدات المجانية");
});

await check("api: النشاط يعرض الرسائل والضغطات", async () => {
  const res = await adminGet("activity").then((r) => r.json());
  assert.equal(res.ok, true);
  assert.ok(Number(res.totals.messages) > 0, "عدد الرسائل يُحسب");
  assert.ok(res.rows.length > 0, "قائمة النشطين");
  assert.ok("clicks_count" in res.rows[0], "عدّاد الضغطات");
});

await check("api: البحث الشامل يجد الطلبات والزبائن", async () => {
  const res = await adminGet("search?q=amine").then((r) => r.json());
  assert.equal(res.ok, true);
  assert.ok(res.users.length >= 1, "وجد الزبون");
});

await check("api: الإذاعة لا تفشل وتصنّف المحظورين", async () => {
  const res = await adminPost("broadcast", { text: "🎉 اختبار إذاعة E2E" });
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.ok(typeof json.sent === "number", "عدد المُرسل");
  assert.ok(typeof json.blocked === "number", "تصنيف المحظورين");
});

/* 9. المسابقات والإحالات */
await check("contest: الدخول من رابط إحالة يمنح صاحب الرابط نقطة ويظهر في اللوحة", async () => {
  const joiner = { id: 4242, is_bot: false, first_name: "مدعو", username: "invited_dz", language_code: "ar" };
  await db.query("DELETE FROM referrals WHERE invitee_id = 4242");
  await db.query("UPDATE users SET points = 0, referrals_count = 0 WHERE tg_id = 555");
  await membership({ "@chinwichi": "member", "@ft_H_N_O": "member", "@CHNawaa": "member", "@C_2_2_H": "member" });
  await resetSent();
  await sendUpdate(msg(joiner, "/start ref_555"));
  const note = await waitForMessage(555, (m) => (m.text ?? "").includes("دخل شخص جديد"));
  assert.ok(note, "وصل إشعار الإحالة للمالك");
  const row = (await db.query("select * from referrals where invitee_id = 4242")).rows[0];
  assert.ok(row, "الإحالة مسجلة");
  assert.equal(Number(row.inviter_id), 555);
  const u = (await db.query("select points, referrals_count, joined_from from users where tg_id = 555")).rows[0];
  assert.equal(Number(u.points), 1);
  assert.equal(Number(u.referrals_count), 1);
  const linked = (await db.query("select joined_from from users where tg_id = 4242")).rows[0];
  assert.equal(linked?.joined_from, "ref:555", "المدلو عليه مربوط بمن أتى به");
  // إحالة مكررة لا تُحتسب
  await sendUpdate(msg(joiner, "/start ref_555"));
  await sleep(800);
  const u2 = (await db.query("select points from users where tg_id = 555")).rows[0];
  assert.equal(Number(u2.points), 1, "لا تُحتسب مرتين");
});

await check("contest: لوحة التحكم تعرض الإحالات ومن أحضر من", async () => {
  const data = await adminGet("contests").then((r) => r.json());
  assert.equal(data.ok, true);
  assert.ok(data.referrals.some((r) => Number(r.invitee_id) === 4242 && Number(r.inviter_id) === 555), "الإحالة مدرجة");
  assert.ok(Array.isArray(data.prizes) && data.prizes.length >= 4, "الجوائز مزروعة");
  const cheap = data.prizes.find((p) => String(p.title).includes("وساطة"));
  assert.equal(Number(cheap.points), 20, "وساطة مجانية = 20 نقطة");
  const usersApi = await adminGet("users?search=invited_dz").then((r) => r.json());
  const me = usersApi.rows.find((u) => String(u.tg_id) === "4242");
  assert.ok(me, "المدلو عليه موجود في قائمة المستخدمين");
  assert.equal(me.inviter_name, "أمين", "يظهر من أحضره");
});

await check("contest: شاشة المسابقات في البوت وزر الجوائز", async () => {
  await resetSent();
  await sendUpdate(cb(users.buyer, "contest"));
  const c = await waitForMessage(555, (m) => (m.text ?? "").includes("مسابقات"));
  assert.ok(hasButton(c, "الجوائز"));
  assert.ok(hasButton(c, "نقاطي"));
  assert.ok(hasButton(c, "المتصدرون"));
  assert.ok(hasButton(c, "الهدية اليومية"));
  await sendUpdate(cb(users.buyer, "prizes"));
  const prizes = await waitForMessage(555, (m) => (m.text ?? "").includes("الجوائز واستبدال النقاط"));
  assert.ok(hasButton(prizes, "10 فليكسي"));
  assert.ok(hasButton(prizes, "20 فليكسي"));
  assert.ok(hasButton(prizes, "0.5 دولار"));
  assert.ok(hasButton(prizes, "وساطة مجانية"));
});

await check("contest: استبدال نقاط بجائزة ثم موافقة المالك", async () => {
  await db.query("UPDATE users SET points = 100 WHERE tg_id = 555");
  const before = (await db.query("select points from users where tg_id = 555")).rows[0];
  assert.equal(Number(before.points), 100);
  const data = await adminGet("contests").then((r) => r.json());
  const target = data.prizes.find((p) => String(p.title).includes("10 فليكسي"));
  await resetSent();
  await db.query("DELETE FROM redemptions WHERE user_id = 555 AND status = 'pending'");
  await resetSent();
  await sendUpdate(cb(users.buyer, `prize:${target.id}`));
  const ask = await waitForMessage(555, (m) => (m.text ?? "").includes("هل تريد استبدال"));
  assert.ok(ask, "سأل عن التأكيد");
  await sendUpdate(cb(users.buyer, `prizebuy:${target.id}`));
  await waitForMessage(555, (m) => (m.text ?? "").includes("تم إرسال طلب الجائزة"));
  const red = (await db.query("select * from redemptions order by id desc limit 1")).rows[0];
  assert.equal(red.status, "pending");
  assert.equal(Number(red.points), 25);
  const after = (await db.query("select points from users where tg_id = 555")).rows[0];
  assert.equal(Number(after.points), 75, "خُصمت النقاط");
  const approve = await adminPost(`redemptions/${red.id}`, { action: "approve" });
  assert.equal(approve.status, 200);
  const final = (await db.query("select status from redemptions where id = $1", [red.id])).rows[0];
  assert.equal(final.status, "approved");
  // إشعار الزبون بالموافقة
  const notified = await waitForMessage(555, (m) => (m.text ?? "").includes("تمت الموافقة"));
  assert.ok(notified, "وصل إشعار الموافقة");
});

await check("contest: رفض الاستبدال يعيد النقاط", async () => {
  await db.query("UPDATE users SET points = 100 WHERE tg_id = 555");
  const data = await adminGet("contests").then((r) => r.json());
  const target = data.prizes.find((p) => String(p.title).includes("وساطة مجانية"));
  await sendUpdate(cb(users.buyer, `prizebuy:${target.id}`));
  await sleep(1000);
  const red = (await db.query("select * from redemptions order by id desc limit 1")).rows[0];
  assert.equal(red.status, "pending");
  const after = (await db.query("select points from users where tg_id = 555")).rows[0];
  assert.equal(Number(after.points), 80);
  const reject = await adminPost(`redemptions/${red.id}`, { action: "reject", note: "غير متاح الآن" });
  assert.equal(reject.status, 200);
  const restored = (await db.query("select points from users where tg_id = 555")).rows[0];
  assert.equal(Number(restored.points), 100, "رجعت النقاط بعد الرفض");
});

await check("contest: الهدية اليومية تُمنح مرة واحدة في اليوم", async () => {
  await db.query("DELETE FROM daily_gifts WHERE user_id = 555 AND claim_date = CURRENT_DATE");
  await db.query("UPDATE users SET points = 100 WHERE tg_id = 555");
  await resetSent();
  await sendUpdate(cb(users.buyer, "dailygift"));
  const got = await waitForMessage(555, (m) => (m.text ?? "").includes("هديتك اليومية وصلت"));
  assert.ok(got);
  const after = (await db.query("select points from users where tg_id = 555")).rows[0];
  assert.equal(Number(after.points), 101);
  await sendUpdate(cb(users.buyer, "dailygift"));
  const again = await waitForMessage(555, (m) => (m.text ?? "").includes("ارجع غداً"));
  assert.ok(again, "الهدية مأخوذة يرفض إعطاءها مرتين");
});

await check("contest: صفحة المسابقة في اللوحة تعمل", async () => {
  const res = await fetch(`${BASE}/admin/contests`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const res2 = await fetch(`${BASE}/admin/users`, { headers: { cookie } });
  assert.equal(res2.status, 200);
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

await check("pages: صفحة الإيموجي المتحرك تعمل", async () => {
  const res = await fetch(`${BASE}/admin/emoji`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(/إيموجي متحرك/.test(html), "العنوان موجود");
});

await check("pages: صفحة صحة النظام تعرض فحص AI المباشر", async () => {
  const res = await fetch(`${BASE}/admin/health`, { headers: { cookie } });
  assert.equal(res.status, 200);
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
