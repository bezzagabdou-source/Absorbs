/* FT AI — تسجيل webhook تيليغرام على رابط الإنتاج (يُشغَّل من أي جهاز فيه شبكة) */
const TOKEN = process.env.BOT_TOKEN || "9000927557:AAG6z4AhWH7p_KaS7jxJKmUnVYDr9hk16uY";
const URL_ = process.env.PUBLIC_URL || "https://ft-contests-bot.vercel.app";
const SECRET = process.env.WEBHOOK_SECRET || "ftai-hook-8c41d2ae6f0b7351";
const hook = `${URL_.replace(/\/$/, "")}/api/webhook`;

const call = (method, body) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json());

const me = await call("getMe");
console.log("getMe:", me);
if (me.ok) {
  const r = await call("setWebhook", {
    url: hook,
    secret_token: SECRET,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
    max_connections: 40,
  });
  console.log("setWebhook:", r);
  console.log("getWebhookInfo:", await call("getWebhookInfo"));
}
