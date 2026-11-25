/**
 * فحص حالة النظام (عام، بلا أسرار) — افتحه في المتصفح للتشخيص السريع:
 *   /api/health
 */
import { env } from "@/lib/env";
import { loadDB, storeMode } from "@/lib/store";
import { getMe, getWebhookInfo, getChat } from "@/lib/tg";
import { countUsers } from "@/lib/bot-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** يخفي مقطع السرّ من أي رابط قبل عرضه للعامة */
function mask(url?: string | null): string | null {
  if (!url) return null;
  return url.replace(/\/api\/tg\/[^/?#]+/, "/api/tg/•••");
}

export async function GET() {
  const started = Date.now();
  const out: Record<string, unknown> = { ok: true, site: env.siteUrl, version: "1.0.0" };

  try {
    out.store = await storeMode();
  } catch (e) {
    out.store = `error: ${(e as Error).message}`;
  }

  try {
    const me = await getMe();
    out.bot = me
      ? { online: true, id: me.id, username: me.username, name: me.first_name }
      : { online: false, error: "BOT_TOKEN غير صالح أو تيليجرام غير متاح" };
    const info = me ? await getWebhookInfo() : null;
    const want = `${env.siteUrl}/api/tg/${env.webhookSecret}`;
    out.webhook = {
      url: mask(info?.url),
      pending: info?.pending_update_count ?? 0,
      error: info?.last_error_message ?? null,
      matches: info?.url === want,
    };
  } catch (e) {
    out.bot = { online: false, error: (e as Error).message };
  }

  try {
    const db = await loadDB();
    const channel = db.settings.forceJoin.username.replace(/^@/, "");
    const chat = channel ? await getChat(`@${channel}`) : null;
    const me = out.bot as { id?: number } | undefined;
    out.forceJoin = {
      enabled: db.settings.forceJoin.enabled,
      channel: `@${channel}`,
      reachable: Boolean(chat),
      title: chat?.title ?? null,
      botIsAdmin: chat && me?.id ? await botIsAdmin(chat.id, me.id) : null,
      note: "لازم يكون البوت أدمن في القناة بصلاحية «إدارة الأعضاء» ليعمل التحقق الحقيقي.",
    };
    out.settings = {
      botEnabled: db.settings.botEnabled,
      maintenance: db.settings.maintenance,
      daily: `${db.settings.points.dailyMin}–${db.settings.points.dailyMax}`,
      botName: db.settings.botName,
      aiEnabled: db.settings.ai.enabled,
    };
    out.users = countUsers(db);
  } catch (e) {
    out.db = { online: false, error: (e as Error).message };
  }

  out.ms = Date.now() - started;
  return Response.json(out);
}

async function botIsAdmin(chatId: number, botId: number): Promise<boolean> {
  const { getChatMember } = await import("@/lib/tg");
  const m = await getChatMember(String(chatId), botId);
  return Boolean(m && ["administrator", "creator"].includes(m.status));
}
