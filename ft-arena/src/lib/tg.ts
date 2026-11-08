/** غلاف خفيف لواجهة Telegram Bot API — بدون أي مكتبات خارجية. */
import { env } from "./env";

const API = () => `https://api.telegram.org/bot${env.botToken}`;

export type Json = Record<string, unknown>;

export class TgError extends Error {
  code: number;
  description: string;
  constructor(code: number, description: string) {
    super(`Telegram ${code}: ${description}`);
    this.code = code;
    this.description = description;
  }
}

export async function tg<T = Json>(method: string, payload: Json = {}, timeoutMs?: number): Promise<T> {
  if (!env.botToken) throw new TgError(401, "BOT_TOKEN is not configured");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs ?? env.httpTimeoutMs);
  try {
    const res = await fetch(`${API()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let data: { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: Json };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new TgError(res.status, `رد غير صالح من تيليجرام (HTTP ${res.status})`);
    }
    if (!data.ok) {
      const err = new TgError(data.error_code ?? res.status, data.description ?? "unknown error");
      (err as TgError & { parameters?: Json }).parameters = data.parameters;
      throw err;
    }
    return data.result as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new TgError(504, `انتهت مهلة ${method}`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** إرسال آمن: يتجاهل أخطاء "message is not modified" ويعيد الرسالة أو null */
export async function safeTg<T = Json>(method: string, payload: Json = {}): Promise<T | null> {
  try {
    return await tg<T>(method, payload);
  } catch (e) {
    const d = (e as TgError).description ?? String(e);
    if (!/not modified|message to edit not found|query is too old/i.test(d)) {
      console.error(`[tg:${method}]`, d);
    }
    return null;
  }
}

/* ───────────────────────────── أنواع مبسطة ───────────────────────────── */

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: string;
  username?: string;
  title?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  photo?: { file_id: string; file_unique_id: string; width: number; height: number }[];
  caption?: string;
  document?: { file_id: string; mime_type?: string; file_name?: string };
  video?: { file_id: string; mime_type?: string };
  sticker?: { file_id: string };
}

export interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}

export interface TgChatMemberUpdated {
  chat: TgChat;
  from: TgUser;
  old_chat_member?: { status: string };
  new_chat_member?: { status: string; user: TgUser };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallback;
  chat_member?: TgChatMemberUpdated;
  my_chat_member?: TgChatMemberUpdated;
}

export interface TgFile {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
}

/* ───────────────────────────── أدوات شائعة ───────────────────────────── */

export const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const link = (text: string, url: string) => `<a href="${url.replace(/"/g, "&quot;")}">${text}</a>`;

export async function sendMessage(
  chatId: number | string,
  text: string,
  keyboard?: unknown,
  extra: Json = {}
): Promise<TgMessage | null> {
  return safeTg<TgMessage>("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
    ...extra,
  });
}

export async function editText(
  chatId: number | string,
  messageId: number,
  text: string,
  keyboard?: unknown
): Promise<TgMessage | null> {
  return safeTg<TgMessage>("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function sendPhoto(
  chatId: number | string,
  photo: string,
  caption?: string,
  keyboard?: unknown
): Promise<TgMessage | null> {
  return safeTg<TgMessage>("sendPhoto", {
    chat_id: chatId,
    photo,
    ...(caption ? { caption, parse_mode: "HTML" } : {}),
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/** ألبوم صورتين — تُستخدم في إشعار الإحالة (صورة الداعي + صورة المنضم) */
export async function sendAlbum(
  chatId: number | string,
  photos: string[],
  caption?: string
): Promise<TgMessage[] | null> {
  const media = photos.slice(0, 10).map((p, i) => ({
    type: "photo",
    media: p,
    ...(i === 0 && caption ? { caption, parse_mode: "HTML" } : {}),
  }));
  if (media.length === 0) return null;
  return safeTg<TgMessage[]>("sendMediaGroup", { chat_id: chatId, media });
}

export async function answerCb(id: string, text?: string, alert = false) {
  return safeTg("answerCallbackQuery", {
    callback_query_id: id,
    ...(text ? { text: text.slice(0, 190), show_alert: alert } : {}),
  });
}

export async function getChatMember(chatId: string, userId: number) {
  return safeTg<{ status: string; user?: TgUser }>("getChatMember", { chat_id: chatId, user_id: userId });
}

export async function getChat(chatId: string) {
  return safeTg<TgChat & { invite_link?: string; description?: string; member_count?: number }>("getChat", {
    chat_id: chatId,
  });
}

/** أول صورة بروفايل للمستخدم (file_id) — تُخزَّن وتُستخدم في كارت الإحالة */
export async function profilePhoto(userId: number): Promise<string | null> {
  const res = await safeTg<{ total_count: number; photos: { file_id: string }[][] }>(
    "getUserProfilePhotos",
    { user_id: userId, limit: 1 }
  );
  const sizes = res?.photos?.[0];
  if (!sizes?.length) return null;
  // أكبر مقاس معقول
  return sizes[Math.min(sizes.length - 1, 2)]?.file_id ?? sizes[0].file_id;
}

export async function copyMessage(chatId: number | string, fromChatId: number | string, messageId: number) {
  return safeTg("copyMessage", { chat_id: chatId, from_chat_id: fromChatId, message_id: messageId });
}

export async function getMe() {
  return safeTg<TgUser & { is_bot: boolean; can_join_groups?: boolean; can_read_all_group_messages?: boolean }>("getMe");
}

export async function setWebhook(url: string, secretToken?: string) {
  return safeTg<boolean>("setWebhook", {
    url,
    allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
    drop_pending_updates: true,
    max_connections: 40,
    ...(secretToken ? { secret_token: secretToken } : {}),
  });
}

export async function deleteWebhook() {
  return safeTg<boolean>("deleteWebhook", { drop_pending_updates: true });
}

export async function getWebhookInfo() {
  return safeTg<{ url?: string; pending_update_count?: number; last_error_message?: string; last_error_date?: number }>(
    "getWebhookInfo"
  );
}

export async function setMyCommands() {
  return safeTg("setMyCommands", {
    commands: [
      { command: "start", description: "🚀 القائمة الرئيسية" },
      { command: "points", description: "💎 نقاطي" },
      { command: "daily", description: "🎁 هدية اليوم" },
      { command: "top", description: "🏆 المتصدرون" },
      { command: "ref", description: "🔗 رابط الإحالة" },
      { command: "shop", description: "🛍️ المتجر" },
      { command: "help", description: "ℹ️ المساعدة" },
    ],
  });
}

export async function setMyDescription() {
  return safeTg("setMyDescription", {
    description:
      "🏆 مسابقات MX — اجمع النقاط من الإحالات والهدية اليومية والعجلة… وحوّلها إلى جوائز حقيقية: Netflix، Google Play، Coinbase، وحتى بوت + موقع خاص بك!",
  });
}

export async function setMyShortDescription() {
  return safeTg("setMyShortDescription", {
    short_description: "🏆 اجمع نقاطًا → اربح جوائز حقيقية. هدية يومية + متصدرون + إحالات.",
  });
}
