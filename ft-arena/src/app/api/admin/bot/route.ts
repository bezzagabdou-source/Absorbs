/**
 * التحكم في البوت: فحص الحالة، ضبط الـ webhook تلقائيًا، حذفه، اختبار، تشغيل التهيئة.
 */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { env } from "@/lib/env";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { getMe, getWebhookInfo, setWebhook, deleteWebhook, sendMessage, getChat } from "@/lib/tg";
import { setupBot } from "@/lib/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  const me = await getMe();
  const info = me ? await getWebhookInfo() : null;
  let join: { ok: boolean; title?: string; error?: string } = { ok: false };
  if (db.settings.forceJoin.username) {
    const chat = await getChat(`@${db.settings.forceJoin.username.replace(/^@/, "")}`);
    join = chat ? { ok: true, title: chat.title } : { ok: false, error: "البوت ليس أدمن في القناة أو المعرف خاطئ" };
  }
  return json({
    ok: true,
    token: Boolean(env.botToken),
    me: me ?? null,
    webhook: info ?? null,
    expectedUrl: `${env.siteUrl}/api/tg/${env.webhookSecret}`,
    join,
    store: await import("@/lib/store").then((m) => m.storeMode()),
  });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { op?: string; url?: string; chatId?: string; text?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  try {
    if (body.op === "setWebhook") {
      const url = (body.url?.trim() || `${env.siteUrl}/api/tg/${env.webhookSecret}`).replace(/\/+$/, "");
      if (!/^https:\/\/.+/.test(url)) return bad("الرابط يجب أن يبدأ بـ https");
      const okRes = await setWebhook(url, env.webhookSecret);
      await mutate((db) => {
        db.meta.webhookUrl = url;
        db.meta.webhookAt = new Date().toISOString();
        logActivity(db, { actor: "admin", icon: "🔗", title: "ضبط Webhook", detail: url });
        return true;
      });
      const setup = await mutate(async (db) => {
        const r = await setupBot(db);
        logActivity(db, { actor: "system", icon: "🤖", title: "تهيئة أوامر البوت ووصفه" });
        return r;
      });
      return json({ ok: Boolean(okRes), url, setup });
    }
    if (body.op === "deleteWebhook") {
      const okRes = await deleteWebhook();
      await mutate((db) => {
        db.meta.webhookUrl = "";
        logActivity(db, { actor: "admin", icon: "🔌", title: "حذف Webhook" });
        return true;
      });
      return json({ ok: Boolean(okRes) });
    }
    if (body.op === "testMessage") {
      const chatId = body.chatId || (await loadDB()).settings.admin.adminChatId || env.adminChatId;
      if (!chatId) return bad("أدخل معرّف المحادثة (ADMIN_CHAT_ID) أولًا");
      const res = await sendMessage(
        chatId,
        body.text || "✅ <b>مسابقات MX</b> — رسالة تجربة من لوحة التحكم.\nكل شيء يعمل بشكل ممتاز!"
      );
      return json({ ok: Boolean(res) });
    }
    if (body.op === "setup") {
      const out = await mutate(async (db) => {
        const r = await setupBot(db);
        logActivity(db, { actor: "admin", icon: "🤖", title: "تشغيل التهيئة الكاملة" });
        return r;
      });
      return json({ ok: true, ...out });
    }
    return bad("op غير معروف");
  } catch (e) {
    return bad(safeDetail(e));
  }
}
