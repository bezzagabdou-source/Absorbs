#!/usr/bin/env node
/**
 * 🧪 تحقق شامل من البوت المنشور (ولا المحلي) — كيتكلّم مع الويب هوك الحقيقي.
 *
 * التشغيل (محلياً، بوضع المحاكاة بلا تيليغرام):
 *   TELEGRAM_MOCK=1 ADMIN_SECRET=dev-secret-1234567890 PANEL_PUBLIC_KEY=testpanelkey \
 *     TELEGRAM_WEBHOOK_SECRET=smoke-secret npx next start -p 3100
 *   BASE=http://localhost:3100 node scripts/verify.mjs
 *
 * على الإنتاج: BASE=https://<bot-domain> PANEL_KEY=<PANEL_PUBLIC_KEY> node scripts/verify.mjs
 */
const BASE = (process.env.BASE || "http://localhost:3100").replace(/\/+$/, "");
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "smoke-secret";
const PANEL_KEY = process.env.PANEL_KEY || process.env.PANEL_PUBLIC_KEY || "testpanelkey";
let pass = 0, fail = 0;
const check = (label, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✅", label); }
  else { fail++; console.log("  ❌", label, extra); }
};
// معرّفات فريدة لكل تشغيل: منع التكرار (claimUpdate) كيتذكّر آخر التحديثات
// حتى بعد إعادة تشغيل السيرفر، فمعرّفات ثابتة كتترفض كـ duplicate.
let uid = Number(process.env.BASE_ID || Date.now() % 1_000_000_000);
async function send(update) {
  const res = await fetch(BASE + "/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify(update),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const msg = (text, id = ++uid, extra = {}) => ({
  update_id: id,
  message: { message_id: id, date: Math.floor(Date.now() / 1000), chat: { id, type: "private" }, from: { id, is_bot: false, first_name: "T" + id, username: "t" + id }, text },
  ...extra,
});
async function calls() {
  const r = await fetch(BASE + "/api/dev/mock");
  return (await r.json()).calls || [];
}
async function clearCalls() { await fetch(BASE + "/api/dev/mock?clear=1", { method: "DELETE" }); }
async function channelState(body) {
  await fetch(BASE + "/api/dev/mock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
const texts = (c) => c.filter((x) => ["sendMessage", "editMessageText"].includes(x.method)).map((x) => JSON.stringify(x.args || x.payload || x));

console.log("\n1) /start مع الاشتراك الإجباري");
await clearCalls();
await channelState({ left: [], broken: [] });
let r = await send(msg("/start"));
check("webhook 200", r.status === 200, JSON.stringify(r.body));
let c = await calls();
check("getChatMember على @mxabdou", JSON.stringify(c).includes("@mxabdou"), JSON.stringify(c).slice(0, 300));
check("ردّ ترحيبي", texts(c).length > 0);

console.log("\n2) منع الاستعمال قبل الاشتراك");
await clearCalls();
await channelState({ left: ["@mxabdou"], broken: [] });
r = await send(msg("/me"));
c = await calls();
check("بوابة ظهرات (joinchk)", JSON.stringify(c).includes("joinchk"));
check("getChatMember تحقّق", JSON.stringify(c).includes("getChatMember"));

console.log("\n3) فشل تيليغرام = fail-closed (ما كاينش تجاوز)");
await clearCalls();
await channelState({ left: [], broken: ["@mxabdou"] });
r = await send(msg("/me"));
c = await calls();
check("Boابة باقية (joinchk)", JSON.stringify(c).includes("joinchk"), JSON.stringify(c).slice(0, 400));

console.log("\n4) منع تكرار نفس update_id");
await channelState({ left: [], broken: [] });
const dup = msg("/start");
const r1 = await send(dup);
const r2 = await send(dup);
check("أول مرة 200", r1.status === 200);
check("الثانية duplicate=true", r2.body?.duplicate === true, JSON.stringify(r2.body));

console.log("\n5) /api/health");
const h = await fetch(BASE + "/api/health");
const hb = await h.json();
check("health 200", h.status === 200, JSON.stringify(hb));
check("بوابة مفروضة", hb.checks?.gate?.ok === true, JSON.stringify(hb.checks?.gate));
check("قناة mxabdou", JSON.stringify(hb.checks?.gate).includes("@mxabdou"));

console.log("\n6) /api/panel/health بالمفتاح");
const ph = await fetch(BASE + "/api/panel/health", { headers: { "x-panel-key": PANEL_KEY } });
const phb = await ph.json();
check("panel health 200", ph.status === 200, JSON.stringify(phb).slice(0, 300));
check("فيه db/migrations/gate", Boolean(phb.db && phb.migrations && phb.gate), JSON.stringify(Object.keys(phb)));
const bad = await fetch(BASE + "/api/panel/health");
check("بلا مفتاح → 401", bad.status === 401, String(bad.status));

console.log(`\nنتيجة: ${pass} ناجح · ${fail} فاشل`);
process.exit(fail ? 1 : 0);
