import { AsyncLocalStorage } from "node:async_hooks";
import { getSettings, saveSettings } from "./settings";
import {
  CONTENT_METHODS,
  acceptedCustomEmoji,
  acceptedIcons,
  buildAttempts,
  lookupFrom,
  normEmoji,
  shouldDowngrade,
  stickerCue,
  type Attempt,
  type EmojiMode,
} from "./emojiLayer";
import { getRuntime, saveCaps } from "./emojiState";

/**
 * 🧩 تشغيل أكثر من بوت على نفس الكود ونفس البيانات.
 * كل طلب ويب هوك يحدّد التوكن متاعو، وكل ndاءات تيليغرام ف ذاك الطلب تمشي بيه.
 */
const tokenCtx = new AsyncLocalStorage<{ token: string }>();

export function runWithBotToken<T>(token: string, fn: () => Promise<T>): Promise<T> {
  return token === tokenCtx.getStore()?.token ? fn() : tokenCtx.run({ token }, fn);
}

export function currentBotToken(): string {
  return tokenCtx.getStore()?.token || "";
}

/** البوت الثاني (اختياري): توكن إضافي عبر TELEGRAM_BOT_TOKEN_2 — نفس المتجر والنقاط */
export function secondBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN_2 || process.env.BOT_TOKEN_2 || "";
}

export type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TgChat = { id: number; type: string; title?: string; username?: string };

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  text?: string;
  date?: number;
  /** أعضاء جدد أُضيفوا للمجموعة */
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  /** 🎭 ملصق (نستعملو file_id ديالو باش نبعثو نفس الملصق) */
  sticker?: { file_id: string; file_unique_id: string; emoji?: string; is_animated?: boolean; is_video?: boolean };
};

/** رابط دعوة أنشأه البوت لعضو معيّن داخل المجموعة */
export type TgChatInviteLink = {
  invite_link: string;
  name?: string;
  creates_join_request?: boolean;
  is_primary?: boolean;
  is_revoked?: boolean;
  expire_date?: number;
  member_limit?: number;
  pending_join_request_count?: number;
};

export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: {
    chat: TgChat;
    from: TgUser;
    new_chat_member: { status: string; user: TgUser };
  };
  /** 🆕 تحديث عضوية (كيخدم حتى إلا كان «منع إضافة الأعضاء» أو join requests) */
  chat_member?: {
    chat: TgChat;
    from?: TgUser;
    date?: number;
    old_chat_member?: { status: string; user: TgUser };
    new_chat_member: { status: string; user: TgUser; is_member?: boolean };
    invite_link?: TgChatInviteLink;
  };
  /** طلب انضمام لمجموعة عبر رابط دعوة (يحمل صاحب الرابط) */
  chat_join_request?: {
    chat: TgChat;
    from: TgUser;
    user_chat_id?: number;
    date?: number;
    invite_link?: TgChatInviteLink;
  };
};

export type TgResult<T = unknown> = {
  ok: boolean;
  result?: T;
  description?: string;
  /** 🧠 للوحة التحكم: شنو قال تيليغرام بالضبط (429 / 400 / …) */
  error_code?: number;
  parameters?: { retry_after?: number };
  /** ⚠️ النتيجة مجهولة (شبكة/timeout) → ما نعاودوش باش ما يتبعتش مرتين */
  uncertain?: boolean;
  retryable?: boolean;
};

export type MockCall = { at: number; method: string; payload: Record<string, unknown> };

/** نداءات قراءة فقط — مسموحة في وضع التجربة */
const READ_METHODS = new Set([
  "getMe",
  "getChatMember",
  "getChat",
  "getChatAdministrators",
  "getChatMemberCount",
  "getWebhookInfo",
]);

const mockGlobal = globalThis as unknown as {
  __ftMockLog?: MockCall[];
  __ftMockSeq?: number;
  /** محاكاة: قنوات المستخدم ماشي مشترك فيها (للاختبارات) */
  __ftMockLeft?: string[];
  /** محاكاة: قنوات تعذّر التحقق منها (البوت ماشي أدمن) */
  __ftMockBroken?: string[];
};

/** سجل آخر نداءات تيليغرام (للتشخيص فقط — TG_TRACE=1) */
export type TgTrace = { at: number; method: string; payload: Record<string, unknown>; result?: unknown; botId?: number };
const traceGlobal = globalThis as unknown as { __ftTrace?: TgTrace[] };
export function tracePush(item: TgTrace) {
  traceGlobal.__ftTrace ||= [];
  traceGlobal.__ftTrace.unshift(item);
  if (traceGlobal.__ftTrace.length > 200) traceGlobal.__ftTrace.length = 200;
}
/** أخطاء الإرسال الأخيرة (تظهر في تدقيق اللوحة) */
export type TgSendError = { at: number; method: string; chatId: unknown; error: string };
const errGlobal = globalThis as unknown as { __ftSendErrors?: TgSendError[] };
export function getSendErrors(): TgSendError[] {
  return errGlobal.__ftSendErrors || [];
}
export function pushSendError(item: TgSendError) {
  errGlobal.__ftSendErrors ||= [];
  errGlobal.__ftSendErrors.unshift(item);
  if (errGlobal.__ftSendErrors.length > 60) errGlobal.__ftSendErrors.length = 60;
}

/** 📊 عدّاد نداءات تيليغرام (يبيّن واش الويب هوك كيتنفّذ فعلاً) */
const ctrGlobal = globalThis as unknown as { __ftTgCalls?: { n: number; lastAt: number; lastMethod: string } };
export function bumpTgCall(method: string) {
  ctrGlobal.__ftTgCalls ||= { n: 0, lastAt: 0, lastMethod: "" };
  ctrGlobal.__ftTgCalls.n += 1;
  ctrGlobal.__ftTgCalls.lastAt = Date.now();
  ctrGlobal.__ftTgCalls.lastMethod = method;
}
export function getTgCalls() {
  return ctrGlobal.__ftTgCalls || { n: 0, lastAt: 0, lastMethod: "" };
}

export function getTrace(): TgTrace[] {
  return traceGlobal.__ftTrace || [];
}
export function clearTrace(): void {
  traceGlobal.__ftTrace = [];
}

export function isMock(): boolean {
  return process.env.TELEGRAM_MOCK === "1";
}

export function getMockLog(): MockCall[] {
  return mockGlobal.__ftMockLog || [];
}

export function clearMockLog() {
  mockGlobal.__ftMockLog = [];
}

/** محاكاة فقط: نحدد القنوات اللي المستخدم ماشي مشترك فيها / اللي تعذّر التحقق منها */
export function setMockChannelState(next: { left?: string[]; broken?: string[] }) {
  mockGlobal.__ftMockLeft = (next.left || []).map(String);
  mockGlobal.__ftMockBroken = (next.broken || []).map(String);
}

export type InlineKeyboard = { inline_keyboard: { text: string; url?: string; callback_data?: string }[][] };

/**
 * 🔌 النداء الخام لتيليجرام — المكان الوحيد في المشروع اللي فيه fetch نحو Bot API.
 * ما يتستعملش مباشرة للإرسال: استعمل `tgCall` (كيمر من طبقة الإيموجي).
 */
export async function rawTg<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<TgResult<T>> {
  const settings = await getSettings();
  const token = currentBotToken() || settings.botToken;

  bumpTgCall(method);

  // 🩺 نسجّل آخر النداءات دايماً (باش اللوحة تشوف شنو تصيفط فعلاً)
  tracePush({ at: Date.now(), method, payload, botId: Number(token.split(":")[0]) || 0 } as never);

  // 🧪 وضع التجربة: قراءة حقيقية، وكل كتابة تتسجّل بلا إرسال
  if (process.env.TG_DRY_RUN === "1" && !READ_METHODS.has(method) && !isMock()) {
    mockGlobal.__ftMockSeq = (mockGlobal.__ftMockSeq || 0) + 1;
    return { ok: true, result: { message_id: 900000 + mockGlobal.__ftMockSeq, ok: true } as unknown as T };
  }

  if (isMock()) {
    mockGlobal.__ftMockLog ||= [];
    mockGlobal.__ftMockLog.unshift({ at: Date.now(), method, payload });
    if (mockGlobal.__ftMockLog.length > 400) mockGlobal.__ftMockLog.length = 400;
    mockGlobal.__ftMockSeq = (mockGlobal.__ftMockSeq || 0) + 1;
    // 🧪 محاكاة رفض تيليجرام لـ ID غالط (اختبار سلّم الاحتياط)
    if (method !== "getStickerSet" && JSON.stringify(payload).includes("MOCKBAD")) {
      return { ok: false, error_code: 400, description: "Bad Request: mock invalid custom emoji identifier" };
    }
    if (method === "getMe") {
      return {
        ok: true,
        result: {
          id: 7000000001,
          is_bot: true,
          first_name: "FT Contest (mock)",
          username: "ft_contest_mock_bot",
        } as unknown as T,
      };
    }
    if (method === "getChatMember") {
      const chat = String(payload.chat_id || "").toLowerCase();
      const listed = (list?: string[]) => (list || []).some((item) => item.toLowerCase() === chat);
      if (listed(mockGlobal.__ftMockBroken) || process.env.MOCK_BROKEN_CHANNELS === "1") {
        return { ok: false, description: "Bad Request: chat not found" };
      }
      const left =
        process.env.MOCK_NOT_MEMBER === "1" || listed(mockGlobal.__ftMockLeft);
      return { ok: true, result: { status: left ? "left" : "member" } as unknown as T };
    }
    if (method === "createChatInviteLink") {
      const seq = mockGlobal.__ftMockSeq;
      const link = `https://t.me/+ftmock${seq}`;
      return {
        ok: true,
        result: {
          invite_link: link,
          name: String(payload.name || ""),
          creates_join_request: Boolean(payload.creates_join_request),
          is_primary: false,
          is_revoked: false,
        } as unknown as T,
      };
    }
    if (method === "getStickerSet") {
      const setName = String(payload.name || "ftmock");
      // 🧪 باقة إيموجي مخصص وهمية (اسمها فيه Emoji) — «MockBadEmoji» كتعطي IDs مرفوضة
      if (/emoji/i.test(setName)) {
        const bad = /bad/i.test(setName);
        return {
          ok: true,
          result: {
            name: setName,
            title: `FT Mock · ${setName}`,
            sticker_type: "custom_emoji",
            stickers: ["🔥", "⭐️", "🎁", "🏆", "✅", "🏠", "👤", "🔗", "🛍", "💰"].map((emoji, n) => ({
              emoji,
              is_animated: true,
              custom_emoji_id: bad ? `MOCKBAD${n}` : `77000000000000${String(n).padStart(2, "0")}`,
            })),
          } as unknown as T,
        };
      }
      return {
        ok: true,
        result: {
          name: setName,
          title: `FT Mock · ${setName}`,
          is_animated: true,
          is_video: false,
          stickers: [1, 2, 3].map((n) => ({
            emoji: ["🔥", "⭐️", "🎁"][n - 1],
            is_video: false,
            video: { file_id: `mocksticker_${setName}_${n}`, file_unique_id: `u_${setName}_${n}` },
          })),
        } as unknown as T,
      };
    }
    if (method === "sendSticker") {
      return {
        ok: true,
        result: { message_id: ++mockGlobal.__ftMockSeq, chat: { id: Number(payload.chat_id) || 0 } } as unknown as T,
      };
    }
    if (method === "getChat") {
      return {
        ok: true,
        result: {
          id: Number(payload.chat_id) || -1000000000000,
          type: "supergroup",
          title: "مجموعة FT (mock)",
          username: "ft_mock_group",
        } as unknown as T,
      };
    }
    return { ok: true, result: { message_id: 1000 + mockGlobal.__ftMockSeq, ok: true } as unknown as T };
  }

  if (!token) return { ok: false, description: "لا يوجد توكن للبوت" };


  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    let json: TgResult<T>;
    try {
      json = (await res.json()) as TgResult<T>;
    } catch {
      return { ok: false, description: `HTTP ${res.status}`, error_code: res.status, uncertain: true };
    }
    if (!json.ok) {
      console.error(`[tg] ${method}`, json.description);
      pushSendError({ at: Date.now(), method, chatId: payload.chat_id, error: String(json.description || "خطأ") });
      const code = Number((json as { error_code?: unknown }).error_code) || res.status;
      const retryAfter = Number((json.parameters as { retry_after?: unknown } | undefined)?.retry_after) || 0;
      json = {
        ...json,
        error_code: code,
        ...(retryAfter ? { parameters: { ...(json.parameters || {}), retry_after: retryAfter } } : {}),
        retryable: code === 429 || code >= 500,
      };
    }
    return json;
  } catch (error) {
    console.error(`[tg] ${method} network error`, error);
    pushSendError({ at: Date.now(), method, chatId: payload.chat_id, error: "تعذّر الاتصال بتلغرام" });
    return { ok: false, description: "تعذّر الاتصال بتلغرام", uncertain: true, retryable: false };
  }
}

export async function getBotIdentity(): Promise<{ id: number | null; username: string }> {
  const settings = await getSettings();
  // 🧩 بوت ثاني ف نفس الطلب؟ نجيبه من تيليغرام وما نكتبوهش ف الإعدادات
  if (currentBotToken() && currentBotToken() !== settings.botToken) {
    const me = await tgCall<TgUser>("getMe");
    return { id: me.ok ? me.result?.id ?? null : null, username: me.ok ? me.result?.username || "" : "" };
  }
  if (settings.botUsername) {
    return { id: settings.botId, username: settings.botUsername };
  }
  const me = await tgCall<TgUser>("getMe");
  if (me.ok && me.result?.username) {
    await saveSettings({ botUsername: me.result.username, botId: me.result.id });
    return { id: me.result.id, username: me.result.username };
  }
  return { id: null, username: settings.botUsername || "" };
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}


/* ══════════════ ✨ الطبقة الوسطية الإجبارية للإيموجي المتحرك ══════════════
   كل إرسال/تعديل في المشروع يدوز من `tgCall`:
     (0) نص متحرك <tg-emoji> + أيقونات أزرار icon_custom_emoji_id
     (1) نص متحرك + أزرار عادية
     (2) النص والأزرار كما كتبهم الكود
     (3) نص خام بلا تنسيق
   المستخدم ما كيشوف حتى خطأ. الخريطة من ذاكرة النسخة — بلا نداء إضافي لكل رسالة. */

export type EmojiOutcome = {
  at: number;
  method: string;
  chatId: string;
  level: number;
  tries: number;
  animated: number;
  accepted: number;
  icons: number;
  iconsAccepted: number;
  ok: boolean;
  firstError: string;
  error: string;
};
const outcomeGlobal = globalThis as unknown as { __ftEmojiOutcomes?: EmojiOutcome[] };
export function getEmojiOutcomes(since = 0): EmojiOutcome[] {
  return (outcomeGlobal.__ftEmojiOutcomes || []).filter((o) => o.at >= since);
}
function pushOutcome(item: EmojiOutcome) {
  outcomeGlobal.__ftEmojiOutcomes ||= [];
  outcomeGlobal.__ftEmojiOutcomes.unshift(item);
  if (outcomeGlobal.__ftEmojiOutcomes.length > 120) outcomeGlobal.__ftEmojiOutcomes.length = 120;
}

const BREAKER_MS = 10 * 60_000;
const BREAKER_AFTER = 3;

function simulated(): boolean {
  return isMock() || process.env.TG_DRY_RUN === "1";
}

/** ننفّذو سلّم المحاولات: ننزلو درجة غير عند خطأ محتوى (400) */
export async function runLadder<T = unknown>(method: string, attempts: Attempt[]) {
  let res: TgResult<T> = { ok: false, description: "لا توجد محاولة" };
  let used = attempts[0];
  let firstError = "";
  let tries = 0;
  const errors: { level: number; error: string }[] = [];
  for (let i = 0; i < attempts.length; i++) {
    used = attempts[i];
    tries += 1;
    res = await rawTg<T>(method, used.payload);
    if (!res.ok) errors.push({ level: used.level, error: String(res.description || "") });
    if (res.ok || i === attempts.length - 1 || !shouldDowngrade(res)) break;
    if (!firstError) firstError = String(res.description || "");
  }
  return { res, used, tries, firstError, errors };
}

export async function tgCall<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
): Promise<TgResult<T>> {
  if (!CONTENT_METHODS.has(method)) return rawTg<T>(method, payload);

  const rt = await getRuntime();
  const now = Date.now();
  const mode: EmojiMode = process.env.EMOJI_OFF === "1" ? "plain" : rt.cfg.mode;
  const chatNum = Number(payload.chat_id);
  const privateChat = Number.isFinite(chatNum) && chatNum > 0;
  const bulk = payload.__ctx === "bulk";
  const attempts = buildAttempts(method, payload, lookupFrom(rt.map), {
    mode,
    text: rt.cfg.caps.text !== false && now >= rt.textOffUntil,
    icons: rt.cfg.caps.button !== false && now >= rt.iconsOffUntil,
    strip: rt.cfg.caps.button === true,
    bulk,
    privateChat,
  });

  // 🎭 الخطة البديلة: ملصق متحرك حقيقي قبل الرسائل المهمة (غير إلا اختار المالك وضع «ملصقات»)
  if (mode === "stickers" && method === "sendMessage" && privateChat && !bulk) {
    const cue = stickerCue(String(payload.text || "")).map(normEmoji).find((e) => rt.stickers[e]);
    if (cue) await rawTg("sendSticker", { chat_id: payload.chat_id, sticker: rt.stickers[cue].fileId }).catch(() => undefined);
  }

  const { res, used, tries, firstError } = await runLadder<T>(method, attempts);

  const first = attempts[0];
  const real = !simulated() && res.ok && typeof res.result === "object" && res.result !== null;
  const accepted = real ? acceptedCustomEmoji(res.result).length : 0;
  const iconsAccepted = real ? acceptedIcons(res.result).length : 0;
  if (first.animated || first.icons || firstError) {
    pushOutcome({
      at: now,
      method,
      chatId: String(payload.chat_id ?? ""),
      level: used.level,
      tries,
      animated: used.animated,
      accepted,
      icons: used.icons,
      iconsAccepted,
      ok: res.ok,
      firstError,
      error: res.ok ? "" : String(res.description || ""),
    });
  }

  if (!simulated()) {
    // ❌ رفض صريح (400): قاطع أمان في الذاكرة — ما نبطّؤوش المستخدمين بمحاولات فاشلة
    if (firstError && res.ok) {
      if (first.icons && used.level === 1) {
        if (++rt.iconDrops >= BREAKER_AFTER) {
          rt.iconDrops = 0;
          rt.iconsOffUntil = Date.now() + BREAKER_MS;
          console.warn("[emoji] أيقونات الأزرار مطفية 10 دقائق:", firstError);
          void saveCaps({ buttonNote: `رفض: ${firstError}`.slice(0, 200) });
        }
      } else if (first.animated && used.level >= 2) {
        if (++rt.textDrops >= BREAKER_AFTER) {
          rt.textDrops = 0;
          rt.textOffUntil = Date.now() + BREAKER_MS;
          console.warn("[emoji] الإيموجي المتحرك مطفي 10 دقائق:", firstError);
          void saveCaps({ textNote: `رفض: ${firstError}`.slice(0, 200) });
        }
      }
    }
    // 🫥 قبول مع إسقاط صامت: تيليجرام رجّع الرسالة بلا custom_emoji → الحساب ما مؤهلش
    if (real && used.level === 0) {
      const result = res.result as { reply_markup?: unknown };
      if (used.animated > 0) {
        if (accepted > 0) {
          rt.textDrops = 0;
          if (rt.cfg.caps.text !== true) {
            rt.cfg.caps.text = true;
            void saveCaps({ text: true, textNote: "" });
          }
        } else if (++rt.textDrops >= BREAKER_AFTER) {
          rt.textDrops = 0;
          rt.cfg.caps.text = false;
          void saveCaps({ text: false, textNote: "تيليجرام قبل الرسالة ولكن حيّد الإيموجي المتحرك (مالك البوت خاصو Telegram Premium)" });
        }
      }
      if (used.icons > 0 && result.reply_markup) {
        if (iconsAccepted > 0) {
          rt.iconDrops = 0;
          if (rt.cfg.caps.button !== true) {
            rt.cfg.caps.button = true;
            void saveCaps({ button: true, buttonNote: "" });
          }
        } else if (++rt.iconDrops >= BREAKER_AFTER) {
          rt.iconDrops = 0;
          rt.cfg.caps.button = false;
          void saveCaps({ button: false, buttonNote: "تيليجرام قبل الأزرار ولكن حيّد الأيقونات المتحركة" });
        }
      }
    }
  }
  return res;
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  extra: Record<string, unknown> = {},
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text: String(text ?? ""),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
    ...extra,
  });
}

export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboard,
) {
  const res = await tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: String(text ?? ""),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
  if (!res.ok) return sendMessage(chatId, text, keyboard);
  return res;
}

/** 🖼️ صورة + كابشن (نفس الطبقة: كابشن متحرك + أيقونات أزرار + احتياط) */
export async function sendPhoto(
  chatId: number | string,
  photo: string,
  caption = "",
  keyboard?: InlineKeyboard,
) {
  return tgCall("sendPhoto", {
    chat_id: chatId,
    photo,
    caption: String(caption ?? "").slice(0, 1024),
    parse_mode: "HTML",
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function sendSticker(chatId: number | string, sticker: string) {
  return tgCall("sendSticker", { chat_id: chatId, sticker });
}

export async function sendChatAction(chatId: number | string, action = "typing") {
  return tgCall("sendChatAction", { chat_id: chatId, action });
}

export async function answerCallback(id: string, text?: string) {
  return tgCall("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text, show_alert: false } : {}),
  });
}

/* ────────────────────── دعوات المجموعة (أسرع ضيف) ────────────────────── */

/** ينشئ رابط دعوة خاص بعضو واحد داخل المجموعة (بطلب انضمام حتى نعرف صاحب الرابط) */
export async function createChatInviteLink(
  chatId: number | string,
  name: string,
): Promise<TgChatInviteLink | null> {
  const res = await tgCall<TgChatInviteLink>("createChatInviteLink", {
    chat_id: chatId,
    name: name.slice(0, 32),
    creates_join_request: true,
  });
  if (!res.ok || !res.result?.invite_link) {
    console.error("[tg] createChatInviteLink failed", res.description);
    return null;
  }
  return res.result;
}

export async function approveJoinRequest(chatId: number | string, userId: number | string) {
  return tgCall("approveChatJoinRequest", { chat_id: chatId, user_id: userId });
}

export async function declineJoinRequest(chatId: number | string, userId: number | string) {
  return tgCall("declineChatJoinRequest", { chat_id: chatId, user_id: userId });
}

export async function getChatInfo(chatId: number | string) {
  return tgCall<TgChat>("getChat", { chat_id: chatId });
}

/* 🎭 آخر ملصق وصّل للبوت — نحفظو file_id باش نستعملوه في الواجهة (تشخيص من /api/telegram/status) */
let lastSticker: { fileId: string; emoji: string; at: number } | null = null;

export async function rememberSticker(sticker: { file_id: string; emoji?: string }): Promise<void> {
  lastSticker = { fileId: sticker.file_id, emoji: String(sticker.emoji || ""), at: Date.now() };
  try {
    const { getStore } = await import("./store");
    await getStore().set("stickers:last", lastSticker);
  } catch {
    /* ما نكسرش البوت */
  }
}

export async function getRememberedSticker(): Promise<{ fileId: string; emoji: string; at: number } | null> {
  if (lastSticker) return lastSticker;
  try {
    const { getStore } = await import("./store");
    return (await getStore().get<{ fileId: string; emoji: string; at: number }>("stickers:last")) || null;
  } catch {
    return null;
  }
}

/** 🎭 يبعث ملصق بهدوء: أي خطأ (ملصق غالط/ماشي متاح) يتجاهل بلا ما يكسر شي */
export async function sendStickerSafe(chatId: number | string, fileId: string): Promise<boolean> {
  if (!String(fileId || "").trim()) return false;
  try {
    const res = await sendSticker(chatId, fileId.trim());
    return Boolean(res.ok);
  } catch {
    return false;
  }
}
