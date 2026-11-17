import { env } from "./env";
import { ensureDb, getSetting, setSetting } from "./db";
import {
  getMe,
  getWebhookInfo,
  setEmojiMap,
  setMyCommands,
  setWebhook,
} from "./telegram";
import { syncEmojiFromSettings } from "./emoji";

/**
 * bootstrap.ts — التهيئة التلقائية عند إقلاع أي دالة على Vercel:
 * 1) بناء المخطط (CREATE TABLE IF NOT EXISTS) وزرع الكاتالوج.
 * 2) قراءة معلومات البوت + تسجيل الأوامر.
 * 3) ربط الويبهوك تلقائياً على رابط النشر (مرة واحدة كل 10 دقائق كحد أقصى).
 */

const WEBHOOK_RETRY_MS = 10 * 60 * 1000;

export async function bootstrap(): Promise<{
  db: boolean;
  bot: boolean;
  webhook: string;
  error?: string;
}> {
  if (!env.botToken) return { db: false, bot: false, webhook: "", error: "TELEGRAM_BOT_TOKEN غير مضبوط" };
  try {
    await ensureDb();
  } catch (err) {
    console.error("[bootstrap] db failed", err);
    return { db: false, bot: false, webhook: "", error: String(err) };
  }

  await syncEmojiFromSettings().catch(() => {});

  const me = await getMe();
  if (!me) return { db: true, bot: false, webhook: "", error: "تعذّر قراءة بيانات البوت (توكن غير صالح؟)" };

  const desired = `${env.siteUrl}/api/telegram/webhook`;
  const lastAt = Number((await getSetting<number>("webhook_set_at")) ?? 0);
  const lastUrl = String((await getSetting<string>("webhook_url")) ?? "");
  const info = await getWebhookInfo();
  let url = info?.url ?? "";

  const stale = Date.now() - lastAt > WEBHOOK_RETRY_MS;
  if (url !== desired && (stale || lastUrl !== desired)) {
    const ok = await setWebhook(desired, env.webhookSecret);
    if (ok) {
      await setSetting("webhook_url", desired);
      await setSetting("webhook_set_at", Date.now());
      url = desired;
      await setMyCommands();
    }
  } else if (!lastAt) {
    await setSetting("webhook_url", url);
    await setSetting("webhook_set_at", Date.now());
  }

  return { db: true, bot: true, webhook: url };
}

export async function ensureWebhook(force = false): Promise<{ ok: boolean; url: string; info?: string }> {
  await ensureDb();
  const desired = `${env.siteUrl}/api/telegram/webhook`;
  const info = await getWebhookInfo();
  if (!force && info?.url === desired) {
    await setSetting("webhook_url", desired);
    await setSetting("webhook_set_at", Date.now());
    return { ok: true, url: desired };
  }
  const ok = await setWebhook(desired, env.webhookSecret);
  if (ok) {
    await setSetting("webhook_url", desired);
    await setSetting("webhook_set_at", Date.now());
    await setMyCommands();
    await getMe();
  }
  return { ok, url: ok ? desired : info?.url ?? "", info: info?.last_error_message };
}

export async function webhookStatus(): Promise<{
  url: string;
  pending: number;
  lastError?: string;
  lastErrorAt?: number;
  expected: string;
  botUsername: string;
  botId: number;
}> {
  const [info, me] = await Promise.all([getWebhookInfo(), getMe()]);
  if (me) setEmojiMap((await getSetting<Record<string, string>>("emoji_map")) ?? {});
  return {
    url: info?.url ?? "",
    pending: info?.pending_update_count ?? 0,
    lastError: info?.last_error_message,
    lastErrorAt: info?.last_error_date,
    expected: `${env.siteUrl}/api/telegram/webhook`,
    botUsername: me?.username ?? "",
    botId: me?.id ?? 0,
  };
}
