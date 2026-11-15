/**
 * تهيئة لمرة واحدة (تُفتح بالمتصفح):
 *   /api/setup?key=<WEBHOOK_SECRET>
 * تربط الـ Webhook بالبوت، تفعّل الأوامر والوصف، وتفحص قناة الاشتراك.
 * آمنة للتكرار، ولا تكشف أي سر في الرد.
 */
import { env } from "@/lib/env";
import { setupBot } from "@/lib/bot";
import { logActivity, mutate } from "@/lib/store";
import { setWebhook, getWebhookInfo, getMe } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (key !== env.webhookSecret) {
    return Response.json({ ok: false, error: "مفتاح غير صحيح" }, { status: 401 });
  }

  const webhookUrl = `${env.siteUrl}/api/tg/${env.webhookSecret}`;
  const me = await getMe();
  if (!me) {
    return Response.json({ ok: false, error: "BOT_TOKEN غير صالح أو لا يمكن الوصول لتيليجرام" }, { status: 502 });
  }

  const hooked = await setWebhook(webhookUrl, env.webhookSecret);
  const info = await getWebhookInfo();
  const setup = await mutate(async (db) => {
    const r = await setupBot(db);
    db.meta.webhookUrl = webhookUrl;
    db.meta.webhookAt = new Date().toISOString();
    logActivity(db, { actor: "system", icon: "⚡️", title: "تهيئة تلقائية كاملة", detail: webhookUrl });
    return r;
  });

  return Response.json({
    ok: Boolean(hooked),
    bot: { id: me.id, username: me.username, name: me.first_name },
    webhook: { url: info?.url ?? webhookUrl, pending: info?.pending_update_count ?? 0, error: info?.last_error_message ?? null },
    commands: setup.results,
    note: "افتح البوت وأرسل /start — يجب أن يرد فورًا.",
  });
}

export async function GET(req: Request) {
  return run(req);
}
export async function POST(req: Request) {
  return run(req);
}
