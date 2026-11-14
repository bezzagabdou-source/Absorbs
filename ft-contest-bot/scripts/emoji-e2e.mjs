#!/usr/bin/env node
/**
 * اختبار تكاملي للطبقة الوسطية للإيموجي المتحرك (على سيرفر بوضع المحاكاة).
 *   TELEGRAM_MOCK=1 PANEL_PUBLIC_KEY=testpanelkey123456 TELEGRAM_WEBHOOK_SECRET=smoke-secret npx next start -p 3111
 *   BASE=http://localhost:3111 PANEL_PUBLIC_KEY=testpanelkey123456 node scripts/emoji-e2e.mjs
 */
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://localhost:3000";
const KEY = process.env.PANEL_PUBLIC_KEY || "testpanelkey123456";
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "smoke-secret";
const USER = 880011;
let seq = 1;

const panel = async (body) => {
  const res = await fetch(`${BASE}/api/panel/emoji`, { method: "POST", headers: { "content-type": "application/json", "x-panel-key": KEY }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
};
const status = async () => (await fetch(`${BASE}/api/panel/emoji`, { headers: { "x-panel-key": KEY } })).json();
const send = async (update) => {
  const res = await fetch(`${BASE}/api/telegram/webhook`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET }, body: JSON.stringify({ update_id: seq++, ...update }) });
  assert.equal(res.status, 200, "الويب هوك خاصو يرجّع 200");
};
const from = { id: USER, is_bot: false, first_name: "Tester" };
const text = (t) => send({ message: { message_id: seq, from, chat: { id: USER, type: "private" }, text: t, date: 1 } });
const press = (data) => send({ callback_query: { id: `cb${seq}`, from, data, message: { message_id: 50, chat: { id: USER, type: "private" } } } });
const clear = () => fetch(`${BASE}/api/dev/mock?clear=1`, { method: "DELETE" });
const calls = async () => (await (await fetch(`${BASE}/api/dev/mock`)).json()).calls.reverse();
const content = (list) => list.filter((c) => /^(sendMessage|editMessageText|sendPhoto)$/.test(c.method) && String(c.payload.chat_id) === String(USER));
const ok = (name) => console.log(`  ✅ ${name}`);

console.log(`\n🔎 اختبار طبقة الإيموجي على ${BASE}\n`);

// 0) الحماية
assert.equal((await fetch(`${BASE}/api/panel/emoji`)).status, 401);
assert.equal((await fetch(`${BASE}/api/cron/emoji`)).status, 401);
ok("المسارات محمية (panel key / CRON_SECRET)");

// 1) خريطة خاوية → البوت كيخدم عادي
await clear();
await text("/start");
let sent = content(await calls());
assert.ok(sent.length >= 1, "خاص /start يجاوب");
assert.ok(!JSON.stringify(sent).includes("tg-emoji"));
ok("بلا خريطة: /start كيجاوب بإيموجي عادي");

// 2) باقة فيها IDs مرفوضة → المستخدم كيتوصل برسالتو (سلّم الاحتياط)
let r = await panel({ op: "add_pack", link: "https://t.me/addemoji/MockBadEmoji" });
assert.equal(r.status, 200, JSON.stringify(r.json));
await new Promise((res) => setTimeout(res, 300));
await clear();
await text("/start");
sent = content(await calls());
const last = sent.at(-1);
assert.ok(sent.some((c) => JSON.stringify(c.payload).includes("MOCKBAD")), "المحاولة الأولى فيها الـID المتحرك");
assert.ok(!JSON.stringify(last.payload).includes("MOCKBAD"), "المحاولة الأخيرة نظيفة");
assert.ok(!JSON.stringify(last.payload).includes("icon_custom_emoji_id"));
assert.ok(String(last.payload.text).length > 10);
ok(`ID مرفوض: ${sent.length} محاولات والرسالة وصلات بإيموجي عادي`);

// 3) نحيّدو الباقة الخايبة ونزيدو باقة صحيحة → نص متحرك + أيقونات أزرار مع الألوان
r = await panel({ op: "remove_pack", name: "MockBadEmoji" });
assert.equal(r.status, 200);
r = await panel({ op: "add_pack", link: "MockEmoji" });
assert.equal(r.status, 200, JSON.stringify(r.json));
let st = await status();
assert.equal(st.counts.emojis, 10);
assert.ok(st.packs.some((p) => p.name === "MockEmoji"));
for (const [name, act] of [["/start", () => text("/start")], ["المتجر", () => press("shop")], ["المسابقات", () => press("home")], ["حسابي", () => press("profile")], ["نقاطي", () => press("points")], ["رابط الإحالة", () => press("reflink")]]) {
  await clear();
  await act();
  sent = content(await calls());
  assert.ok(sent.length >= 1, `${name}: ما كاين حتى رد`);
  const body = JSON.stringify(sent.map((c) => c.payload));
  assert.ok(!body.includes("MOCKBAD"));
  const animated = (body.match(/tg-emoji emoji-id/g) || []).length;
  const icons = (body.match(/icon_custom_emoji_id/g) || []).length;
  assert.ok(animated + icons > 0, `${name}: ما فيه حتى إيموجي متحرك`);
  ok(`${name}: ${sent.length} رسالة — ${animated} إيموجي متحرك، ${icons} أيقونة زر`);
}

// 4) الألوان محفوظة + الإيموجي كيبقى في نص الزر حتى تتأكد الأيقونات
await clear();
await press("shop");
sent = content(await calls());
const buttons = sent.flatMap((c) => c.payload.reply_markup?.inline_keyboard || []).flat();
assert.ok(buttons.length > 0);
assert.ok(buttons.filter((b) => b.icon_custom_emoji_id).every((b) => /\p{Extended_Pictographic}/u.test(b.text)), "قبل التأكيد: الإيموجي باقي في النص");
ok(`المتجر: ${buttons.length} زر، ${buttons.filter((b) => b.style).length} ملوّن، ${buttons.filter((b) => b.icon_custom_emoji_id).length} بأيقونة`);

// 5) الأوضاع
r = await panel({ op: "mode", mode: "plain" });
assert.equal(r.status, 200);
await new Promise((res) => setTimeout(res, 200));
await clear();
await text("/start");
assert.ok(!JSON.stringify(content(await calls())).includes("tg-emoji"), "plain: بلا متحرك");
ok("وضع plain: نص عادي");
r = await panel({ op: "mode", mode: "stickers" });
await clear();
await press("points");
sent = content(await calls());
assert.ok(!JSON.stringify(sent).includes("tg-emoji"));
ok("وضع stickers: تنسيق غني بلا tg-emoji");
assert.equal((await panel({ op: "mode", mode: "xx" })).status, 400);
r = await panel({ op: "mode", mode: "animated" });
assert.equal((await status()).mode, "animated");

// 6) تعديل/حذف إيموجي
r = await panel({ op: "remove_emoji", emoji: "🔥" });
assert.equal(r.status, 200);
st = await status();
assert.equal(st.counts.emojis, 9);
r = await panel({ op: "set_emoji", emoji: "🔥", id: "abc" });
assert.equal(r.status, 400);
ok("حذف إيموجي + رفض ID ماشي صحيح");

// 7) الاكتشاف بالدفعات
let step = (await panel({ op: "discover", restart: true })).json;
let guard = 0;
while (!step.done && guard++ < 20) step = (await panel({ op: "discover" })).json;
assert.ok(step.done && step.ok, JSON.stringify(step));
st = await status();
assert.ok(st.discovery.finishedAt > 0);
ok(`الاكتشاف كمل: ${step.verified} باقة، ${step.emojis} إيموجي، ${step.failed} فشل`);

console.log("\n🎉 كلشي داز\n");
