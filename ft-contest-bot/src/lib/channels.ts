import { getSettings } from "./settings";
import { tgCall } from "./telegram";
import type { Settings } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   بوابة الاشتراك الإجباري — ست قنوات.

   🛟 قاعدة ذهبية: إذا تعذّر التحقّق من قناة (البوت ماشي أدمن، القناة خاصة،
   تيليغرام رفض...) → نتجاوزو القناة ونسجّلو الخطأ، وما نمنعوش المستخدم أبداً.
   السبب: getChatMember ترجّع «member list is inaccessible» ملي البوت ما يكونش
   أدمن، وكانت الطريقة القديمة توقّف البوت ويسكت.
   ══════════════════════════════════════════════════════════════════════════ */

/** حالات تيليغرام اللي معناها «مشترك» */
const MEMBER_STATUS = ["creator", "administrator", "member"];

/** أخطاء معناها «البوت ما يقدرش يتحقق» — ما نبلوكيوش المستخدم بسببها */
const SOFT_ERROR =
  /chat not found|not enough rights|member list is inaccessible|bot is not a member|chat_admin_required|user not found|user_id_invalid|participant_id_invalid|chat_write_forbidden|bot was blocked/i;

export type ChannelCheck = { chat: string; url: string; status: string };

export function channelUrl(chat: string): string {
  if (!chat) return "";
  if (chat.startsWith("@")) return `https://t.me/${chat.slice(1)}`;
  if (/^https?:\/\//.test(chat)) return chat;
  return "";
}

/** القنوات المطلوبة فعلياً (لا شيء إذا كان الاشتراك غير إجباري) */
export function requiredChannelsOf(settings: Settings): string[] {
  if (!settings.requireJoin) return [];
  const list = (settings.requiredChannels || []).filter(Boolean);
  if (list.length) return list;
  return settings.channelChat ? [settings.channelChat] : [];
}

export type GateResult = {
  required: string[];
  missing: ChannelCheck[];
  soft: string[];
  ok: boolean;
  /** كم قناة تحقّقنا منها فعلاً */
  checked: number;
};

/** ذاكرة مؤقّتة قصيرة: ما نضربوش تيليغرام 6 مرات في كل ضغطة زر */
const cacheGlobal = globalThis as unknown as {
  __ftGateCache?: Map<string, { at: number; result: GateResult }>;
};
const CACHE_MS = 45_000;

function cacheKey(settings: Settings, userId: number | string) {
  return `${userId}|${(settings.requiredChannels || []).join(",")}|${settings.requireJoin ? 1 : 0}`;
}

/**
 * نتحقق من اشتراك المستخدم في كل القنوات.
 * - missing: قنوات ثبت أنو ما مشتركش فيها → نطلبو ينضم
 * - soft:    قنوات تعذّر التحقّق منها (البوت ماشي أدمن...) → نتجاوزوها
 */
export async function checkChannels(
  settings: Settings,
  userId: number | string,
  opts: { force?: boolean } = {},
): Promise<GateResult> {
  const required = requiredChannelsOf(settings);
  if (!required.length) return { required, missing: [], soft: [], ok: true, checked: 0 };

  cacheGlobal.__ftGateCache ||= new Map();
  const key = cacheKey(settings, userId);
  if (!opts.force) {
    const hit = cacheGlobal.__ftGateCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;
  }

  const missing: ChannelCheck[] = [];
  const soft: string[] = [];
  let checked = 0;

  for (const chat of required) {
    // 🛟 كل نداء معزول: خطأ قناة واحدة ما يوقفش الباقي
    let res: { ok: boolean; result?: { status: string }; description?: string };
    try {
      res = await tgCall<{ status: string }>("getChatMember", { chat_id: chat, user_id: userId });
    } catch (error) {
      res = { ok: false, description: String((error as Error)?.message || error) };
    }

    if (!res.ok || !res.result) {
      const reason = res.description || "تعذّر التحقّق";
      soft.push(`${chat}: ${reason}`);
      // سجل واضح بلا ما نطيّحو البوت: هذي هي الحالة «البوت ماشي أدمن»
      console.warn(`[gate] تم تجاوز القناة ${chat} — ${reason}`);
      continue;
    }
    checked += 1;
    if (!MEMBER_STATUS.includes(res.result.status)) {
      missing.push({ chat, url: channelUrl(chat), status: res.result.status });
    }
  }

  const result: GateResult = { required, missing, soft, ok: missing.length === 0, checked };
  cacheGlobal.__ftGateCache.set(key, { at: Date.now(), result });
  if (cacheGlobal.__ftGateCache.size > 4000) cacheGlobal.__ftGateCache.clear();
  return result;
}

export function clearGateCache(): void {
  cacheGlobal.__ftGateCache?.clear();
}

/* ─────────────── 🩺 تشخيص: واش البوت أدمن في كل قناة؟ ─────────────── */

export type ChannelHealth = {
  chat: string;
  url: string;
  /** حالة البوت نفسه في القناة (administrator / member / left / ...) */
  botStatus: string;
  isAdmin: boolean;
  title: string;
  /** خطأ تيليغرام الحقيقي إن وقع */
  error: string;
  /** هل نقدر نتحقق من اشتراك الأعضاء؟ */
  canVerifyMembers: boolean;
};

/**
 * يفحص كل قناة مطلوبة: هل البوت عضو؟ وهل هو أدمن؟
 * `canVerifyMembers=false` معناها getChatMember غادي ترجّع
 * «member list is inaccessible» → لازم ترقّي البوت أدمن.
 */
export async function channelAdminReport(
  channelsInput?: string[],
): Promise<{ bot: { id: number | null; username: string }; channels: ChannelHealth[]; checkedAt: string }> {
  const settings = await getSettings();
  const channels = channelsInput && channelsInput.length ? channelsInput : settings.requiredChannels || [];

  const me = await tgCall<{ id: number; username?: string }>("getMe");
  const botId = me.ok && me.result ? me.result.id : null;
  const botUsername = me.ok && me.result?.username ? me.result.username : "";

  const channels_ = [] as ChannelHealth[];
  for (const chat of channels) {
    const health: ChannelHealth = {
      chat,
      url: channelUrl(chat),
      botStatus: "unknown",
      isAdmin: false,
      title: "",
      error: "",
      canVerifyMembers: false,
    };

    const info = await tgCall<{ title?: string; username?: string }>("getChat", { chat_id: chat });
    if (!info.ok || !info.result) {
      health.error = info.description || "تعذّر قراءة القناة";
      channels_.push(health);
      continue;
    }
    health.title = info.result.title || "";

    if (botId) {
      const member = await tgCall<{ status: string }>("getChatMember", { chat_id: chat, user_id: botId });
      if (!member.ok || !member.result) {
        health.error = member.description || "تعذّر قراءة عضوية البوت";
        channels_.push(health);
        continue;
      }
      health.botStatus = member.result.status;
      health.isAdmin = member.result.status === "administrator" || member.result.status === "creator";
      health.canVerifyMembers = health.isAdmin;
    }

    // 🔎 الاختبار الحقيقي: هل نقدر نقرا عضوية عضو عادي؟
    // (هنا نستعمل آي دي غير موجود باش نتأكدو من الصلاحية بلا ما نكشفو مستخدم)
    const probe = await tgCall<{ status: string }>("getChatMember", { chat_id: chat, user_id: 777000 });
    if (!probe.ok && SOFT_ERROR.test(String(probe.description || ""))) {
      health.canVerifyMembers = false;
      health.error = probe.description || health.error;
    }
    channels_.push(health);
  }

  return { bot: { id: botId, username: botUsername }, channels: channels_, checkedAt: new Date().toISOString() };
}
