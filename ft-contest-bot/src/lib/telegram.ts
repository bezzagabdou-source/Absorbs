import { AsyncLocalStorage } from "node:async_hooks";
import { getSettings, saveSettings } from "./settings";

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
  error_code?: number;
  parameters?: { retry_after?: number };
  /** The request may have reached Telegram, so it must not be retried blindly. */
  uncertain?: boolean;
  /** The connection failed before HTTP could be sent; safe to try again. */
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
  "getMyCommands",
]);

const mockGlobal = globalThis as unknown as {
  __ftMockLog?: MockCall[];
  __ftMockSeq?: number;
  /** محاكاة: قنوات المستخدم ماشي مشترك فيها (للاختبارات) */
  __ftMockLeft?: string[];
  /** محاكاة: قنوات تعذّر التحقق منها (البوت ماشي أدمن) */
  __ftMockBroken?: string[];
  __ftMockCommands?: { command: string; description: string }[];
  __ftMockWebhook?: string;
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

export type InlineKeyboard = { inline_keyboard: { text: string; url?: string; callback_data?: string; style?: "success" | "danger" | "primary" }[][] };

export async function tgCall<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
  options: { quietFailure?: boolean } = {},
): Promise<TgResult<T>> {
  const settings = await getSettings();
  const token = currentBotToken() || settings.botToken;

  bumpTgCall(method);

  // Do not retain large embedded image data in diagnostic traces or mock logs.
  const inlinePhoto = method === "sendPhoto" && typeof payload.photo === "string" && payload.photo.startsWith("data:image/");
  const loggedPayload = method === "setWebhook" && payload.secret_token
    ? { ...payload, secret_token: "[redacted]" }
    : inlinePhoto ? { ...payload, photo: "[inline image]" } : payload;
  tracePush({ at: Date.now(), method, payload: loggedPayload, botId: Number(token.split(":")[0]) || 0 } as never);

  // 🧪 وضع التجربة: قراءة حقيقية، وكل كتابة تتسجّل بلا إرسال
  if (process.env.TG_DRY_RUN === "1" && !READ_METHODS.has(method) && !isMock()) {
    mockGlobal.__ftMockSeq = (mockGlobal.__ftMockSeq || 0) + 1;
    return { ok: true, result: { message_id: 900000 + mockGlobal.__ftMockSeq, ok: true } as unknown as T };
  }

  if (isMock()) {
    mockGlobal.__ftMockLog ||= [];
    mockGlobal.__ftMockLog.unshift({ at: Date.now(), method, payload: loggedPayload });
    if (mockGlobal.__ftMockLog.length > 400) mockGlobal.__ftMockLog.length = 400;
    mockGlobal.__ftMockSeq = (mockGlobal.__ftMockSeq || 0) + 1;
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
    if (method === "getMyCommands") return { ok: true, result: (mockGlobal.__ftMockCommands || []) as unknown as T };
    if (method === "setMyCommands") { mockGlobal.__ftMockCommands = payload.commands as { command: string; description: string }[]; return { ok: true, result: true as T }; }
    if (method === "getWebhookInfo") return { ok: true, result: { url: mockGlobal.__ftMockWebhook || "", pending_update_count: 0 } as unknown as T };
    if (method === "setWebhook") { mockGlobal.__ftMockWebhook = String(payload.url || ""); return { ok: true, result: true as T }; }
    if (method === "deleteWebhook") { mockGlobal.__ftMockWebhook = ""; return { ok: true, result: true as T }; }
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
    let body: string | FormData = JSON.stringify(payload);
    let headers: Record<string, string> | undefined = { "Content-Type": "application/json" };
    if (inlinePhoto) {
      const match = /^data:(image\/(?:png|jpe?g|webp|gif));base64,([\s\S]+)$/.exec(String(payload.photo));
      if (!match) return { ok: false, description: "الصورة غير صالحة" };
      const encoded = match[2].replace(/\s/g, "");
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return { ok: false, description: "الصورة غير صالحة" };
      const bytes = Buffer.from(encoded, "base64");
      if (!bytes.length || bytes.length > 1_500_000 || bytes.toString("base64") !== encoded) return { ok: false, description: "الصورة غير صالحة أو كبيرة" };
      const form = new FormData();
      for (const [key, value] of Object.entries(payload)) {
        if (value === undefined || value === null || key === "photo") continue;
        form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
      const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
      const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
      form.set("photo", new Blob([bytes], { type: mime }), `reward.${extension}`);
      body = form;
      headers = undefined; // fetch creates the multipart boundary.
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST", headers, body, cache: "no-store", signal: AbortSignal.timeout(method === "sendPhoto" ? 12000 : 8000),
    });
    const json = (await res.json()) as TgResult<T>;
    if (!json || typeof json.ok !== "boolean" || (!json.ok && !Number.isInteger(json.error_code))) {
      // A malformed response cannot prove whether Telegram accepted the write.
      return { ok: false, description: "رد غير واضح من تلغرام", uncertain: true };
    }
    if (!json.ok && !options.quietFailure) {
      console.error(`[tg] ${method}`, json.description);
      pushSendError({ at: Date.now(), method, chatId: payload.chat_id, error: String(json.description || "خطأ") });
    }
    return json;
  } catch (error) {
    if (!options.quietFailure) {
      console.error(`[tg] ${method} network error`, error);
      pushSendError({ at: Date.now(), method, chatId: payload.chat_id, error: "تعذّر الاتصال بتلغرام" });
    }
    const failure = error as { code?: string; cause?: { code?: string } };
    const code = String(failure?.cause?.code || failure?.code || "");
    const retryable = ["ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "ECONNREFUSED", "UND_ERR_CONNECT_TIMEOUT"].includes(code);
    // A timeout/reset after connecting may have delivered the message: never
    // retry that automatically. DNS/connect failures are known pre-send.
    return { ok: false, description: "تعذّر الاتصال بتلغرام", uncertain: !retryable, retryable };
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

export async function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
  extra: Record<string, unknown> = {},
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
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
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  }, { quietFailure: true });
  if (!res.ok) {
    // Photo messages cannot be edited as text. Once a replacement is sent, remove
    // the old keyboard so its purchase/confirm button cannot be tapped again.
    const sent = await sendMessage(chatId, text, keyboard);
    if (sent.ok) await tgCall("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }, { quietFailure: true });
    return sent;
  }
  return res;
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
