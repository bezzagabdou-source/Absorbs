import { headers } from "next/headers";
import { getSettings, saveSettings } from "./settings";
import { getMockLog, isMock, tgCall } from "./telegram";

export const BOT_COMMANDS = [
  { command: "start", description: "مرحبا بكم في بوت مسابقات FT" },
  { command: "fastest", description: "مسابقة أسرع ضيف — رابط الدعوة" },
  { command: "me", description: "دعواتي ورابطي" },
  { command: "account", description: "حسابي — الرصيد والنقاط" },
  { command: "points", description: "نقاطي ورصيدي" },
  { command: "shop", description: "متجر الجوائز — بدّل نقاطك 🎁" },
  { command: "join", description: "دخول المجموعة ورابط الدعوة" },
  { command: "top", description: "الترتيب" },
  { command: "claim", description: "ربح الحساب" },
  { command: "link", description: "رابط الدعوة / الإحالة" },
  { command: "ref", description: "رابط الإحالة" },
  { command: "rules", description: "الشروط" },
  { command: "ai", description: "المساعد الذكي — اسأل أي حاجة" },
  { command: "owner", description: "مالك البوت" },
];

/** أنواع التحديثات التي يستقبلها الويب هوك (تشمل طلبات الانضمام للمجموعة) */
export const ALLOWED_UPDATES = [
  "message",
  "edited_message",
  "callback_query",
  "my_chat_member",
  "chat_join_request",
  "chat_member",
];

export type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
};

export type BotStatus = {
  tokenConfigured: boolean;
  botOk: boolean;
  botUsername: string;
  botName: string;
  webhookExpected: string;
  webhookCurrent: string;
  webhookMatches: boolean;
  /** كل أنواع التحديثات المطلوبة (طلبات الانضمام للمجموعة...) مسجّلة؟ */
  updatesOk: boolean;
  pendingUpdates: number;
  lastError: string;
  secretProtected: boolean;
  fixed: boolean;
  details: string[];
};

const guardGlobal = globalThis as unknown as {
  __ftAutoSetupAt?: number;
  __ftAutoSetupReport?: BotStatus;
};

/** أصل الموقع الحالي (للبناء عليه رابط الويب هوك) */
export async function currentOrigin(): Promise<string> {
  // على Vercel: نعتمد دومين الإنتاج دائماً حتى لو فُتحت الصفحة من رابط معاينة
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  const bag = await headers();
  const host = bag.get("x-forwarded-host") || bag.get("host") || "";
  const proto = bag.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function fetchStatus(expectedUrl: string): Promise<BotStatus> {
  const settings = await getSettings();
  const details: string[] = [];
  const status: BotStatus = {
    tokenConfigured: Boolean(settings.botToken),
    botOk: false,
    botUsername: settings.botUsername,
    botName: "",
    webhookExpected: expectedUrl,
    webhookCurrent: "",
    webhookMatches: false,
    updatesOk: false,
    pendingUpdates: 0,
    lastError: "",
    secretProtected: Boolean(settings.webhookSecret),
    fixed: false,
    details,
  };

  if (!settings.botToken) {
    details.push("لا يوجد توكن بوت — أضفه من الإعدادات أو متغيرات Vercel.");
    return status;
  }

  const me = await tgCall<{ id: number; username?: string; first_name?: string }>("getMe");
  if (!me.ok || !me.result) {
    details.push(`التوكن غير صالح أو تيليغرام غير متاح: ${me.description || "خطأ غير معروف"}`);
    return status;
  }
  status.botOk = true;
  status.botUsername = me.result.username || settings.botUsername;
  status.botName = me.result.first_name || "";
  if (status.botUsername !== settings.botUsername || me.result.id !== settings.botId) {
    await saveSettings({ botUsername: status.botUsername, botId: me.result.id });
  }

  const info = await tgCall<WebhookInfo>("getWebhookInfo");
  if (info.ok && info.result) {
    status.webhookCurrent = info.result.url || "";
    status.pendingUpdates = info.result.pending_update_count || 0;
    status.lastError = info.result.last_error_message || "";
    status.webhookMatches = Boolean(status.webhookCurrent) && status.webhookCurrent === expectedUrl;
    const registered = info.result.allowed_updates;
    // allowed_updates فارغة = تيليغرام يرسل الافتراضي فقط (بدون طلبات الانضمام للمجموعة)
    status.updatesOk = Array.isArray(registered)
      ? ALLOWED_UPDATES.every((u) => registered.includes(u))
      : false;
    if (status.webhookMatches && !status.updatesOk) {
      details.push("الويب هوك مسجّل لكن بدون تحديثات المجموعة (طلبات الانضمام) — سيُعاد ضبطه.");
    }
    if (!status.webhookMatches) {
      details.push(
        status.webhookCurrent
          ? `الويب هوك مربوط بعنوان مختلف: ${status.webhookCurrent}`
          : "لا يوجد ويب هوك مسجّل — البوت لا يستقبل أي رسالة.",
      );
    }
  } else {
    details.push(`تعذّر قراءة حالة الويب هوك: ${info.description || "خطأ"}`);
  }

  return status;
}

/**
 * يضمن أن البوت مربوط بالموقع: يتحقق من التوكن، ويسجّل الويب هوك تلقائياً
 * إذا كان غائباً أو يشير إلى دومين آخر. يعمل على Vercel بدون أي أمر يدوي.
 */
export async function ensureBotReady(
  options: { force?: boolean; origin?: string } = {},
): Promise<BotStatus> {
  const now = Date.now();
  const cached = guardGlobal.__ftAutoSetupReport;
  if (!options.force && cached && guardGlobal.__ftAutoSetupAt && now - guardGlobal.__ftAutoSetupAt < 5 * 60 * 1000) {
    return cached;
  }

  const settings = await getSettings();
  const origin = options.origin || (await currentOrigin());
  const expectedUrl = `${origin}/api/telegram/webhook`;
  const status = await fetchStatus(expectedUrl);

  if (status.botOk && settings.botToken && (!status.webhookMatches || !status.updatesOk)) {
    const res = await tgCall("setWebhook", {
      url: expectedUrl,
      ...(settings.webhookSecret ? { secret_token: settings.webhookSecret } : {}),
      allowed_updates: ALLOWED_UPDATES,
      drop_pending_updates: false,
    });
    if (res.ok) {
      status.fixed = true;
      status.webhookCurrent = expectedUrl;
      status.webhookMatches = true;
      status.updatesOk = true;
      status.details.push("تم ربط الويب هوك تلقائياً بالموقع ✅");
      await tgCall("setMyCommands", { commands: BOT_COMMANDS });
    } else {
      status.details.push(`فشل ربط الويب هوك تلقائياً: ${res.description || "خطأ"}`);
    }
  }

  // 🧹 منيو الأوامر كيتحدّث دايما (حذفنا /emojis و/addemoji من المينو — بقاو خدامين للوحة)
  try {
    await tgCall("setMyCommands", { commands: BOT_COMMANDS });
  } catch {
    /* ما نعطّلو التشخيص */
  }

  guardGlobal.__ftAutoSetupAt = now;
  guardGlobal.__ftAutoSetupReport = status;
  return status;
}

export function resetAutoSetupCache() {
  guardGlobal.__ftAutoSetupAt = 0;
  guardGlobal.__ftAutoSetupReport = undefined;
}

export function recentMockTraffic(limit = 10) {
  if (!isMock()) return [];
  return getMockLog().slice(0, limit);
}
