import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { dbQuery, dbUndo, dbUpdate } from "@/lib/panelAgentStore";
import { getSettings } from "@/lib/settings";
import { tgCall, type TgUser } from "@/lib/telegram";
import { ALLOWED_UPDATES } from "@/lib/botSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(req.headers.get("x-panel-key") || "");
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
type Command = { command: string; description: string };
type Webhook = { url?: string; pending_update_count?: number; last_error_date?: number; allowed_updates?: string[] };
async function info() {
  const [me, webhook, commands] = await Promise.all([tgCall<TgUser>("getMe"), tgCall<Webhook>("getWebhookInfo"), tgCall<Command[]>("getMyCommands")]);
  if (!me.ok || !webhook.ok || !commands.ok || !Array.isArray(commands.result)) throw new Error("تعذّر الحصول على معلومات تيليغرام كاملة");
  const url = String(webhook.result?.url || "").split("?")[0];
  return { bot: { id: me.result?.id, username: me.result?.username, name: me.result?.first_name },
    webhook: { url, pending: webhook.result?.pending_update_count || 0, lastErrorDate: webhook.result?.last_error_date || null, allowedUpdates: webhook.result?.allowed_updates || [] }, commands: commands.result };
}
function commands(input: unknown): Command[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error("قائمة الأوامر غير صالحة");
  return input.map(value => {
    if (!value || typeof value !== "object" || typeof value.command !== "string" || !/^[a-z0-9_]{1,32}$/.test(value.command) || typeof value.description !== "string" || !value.description.trim() || value.description.length > 256) throw new Error("أمر تيليغرام غير صالح");
    return { command: value.command, description: value.description.trim() };
  });
}
export async function POST(request: NextRequest) {
  if (!authorized(request)) return reply({ ok: false, error: "unauthorized" }, 401);
  if (Number(request.headers.get("content-length") || 0) > 150_000) return reply({ ok: false, error: "request too large" }, 413);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body) || JSON.stringify(body).length > 150_000) return reply({ ok: false, error: "invalid request" }, 400);
  try {
    if (body.op === "db_query") return reply({ ok: true, ...(await dbQuery(body)) });
    if (body.op === "db_update") return reply({ ok: true, ...(await dbUpdate(body)) });
    if (body.op === "db_undo") return reply({ ok: true, ...(await dbUndo(body)) });
    if (body.op === "get_bot_info") return reply({ ok: true, ...(await info()) });
    if (body.op === "set_commands") {
      const list = commands(body.commands);
      const result = await tgCall("setMyCommands", { commands: list });
      if (!result.ok) throw new Error("تعذّر تحديث أوامر تيليغرام");
      return reply({ ok: true, updated: true, count: list.length });
    }
    if (body.op === "delete_webhook") {
      const result = await tgCall("deleteWebhook", { drop_pending_updates: false });
      if (!result.ok) throw new Error("تعذّر حذف ويب هوك تيليغرام");
      return reply({ ok: true, updated: true, url: "" });
    }
    if (body.op === "set_webhook") {
      // Never let an LLM redirect updates (and users' data) to an arbitrary host.
      const url = new URL(String(body.url || ""));
      const requestHost = new URL(request.url).hostname.toLowerCase();
      const configuredHost = (process.env.AGENT_WEBHOOK_HOST || requestHost).toLowerCase();
      if (url.protocol !== "https:" || url.hostname.toLowerCase() !== configuredHost || url.port || url.username || url.password || url.search || url.hash || url.pathname !== "/api/telegram/webhook") throw new Error("رابط الويب هوك يجب أن يشير إلى نطاق البوت المهيأ ومساره الصحيح");
      const settings = await getSettings();
      if (!settings.webhookSecret) throw new Error("سر الويب هوك غير مهيأ في إعدادات البوت");
      const result = await tgCall("setWebhook", { url: url.toString(), secret_token: settings.webhookSecret, allowed_updates: ALLOWED_UPDATES, drop_pending_updates: false });
      if (!result.ok) throw new Error("تعذّر تحديث ويب هوك تيليغرام");
      return reply({ ok: true, updated: true, url: url.toString() });
    }
    return reply({ ok: false, error: "unknown operation" }, 404);
  } catch (error) {
    // Do not serialize SQL, connection URLs, credentials, or raw provider errors.
    const message = error instanceof Error && /^(?:مفتاح|القيمة|قيمة|حدد|اقرأ|تغيّرت|أُنشئ|استخدم|النسخة|تعذّر|تعديل|هيّئ|قائمة|أمر|رابط|سر)/.test(error.message) ? error.message : "تعذّر تنفيذ العملية في البوت";
    return reply({ ok: false, error: message.slice(0, 300) }, 400);
  }
}
