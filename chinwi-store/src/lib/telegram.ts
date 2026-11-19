import { env } from "./env";

/**
 * telegram.ts — طبقة تيليجرام الموحّدة.
 * كل رسالة خارجة تمر من هنا: إيموجي متحرك (اختياري) + احتياط تلقائي + أزرار منظمة.
 */

/** ألوان أزرار تيليجرام الرسمية (Bot API 9.0+): danger = أحمر، success = أخضر، primary = أزرق */
export type ButtonStyle = "success" | "danger" | "primary";

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
  copy_text?: { text: string };
  web_app?: { url: string };
  /** لون الزر: success أخضر / danger أحمر */
  style?: ButtonStyle;
  /** إيموجي متحرك (custom emoji) قبل نص الزر */
  icon_custom_emoji_id?: string;
};

export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

/** إزالة ألوان الأزرار (style) — تُستخدم كاحتياط لو رفض العميل الحقل */
export function stripButtonStyles(kbd: InlineKeyboard): InlineKeyboard {
  return {
    inline_keyboard: kbd.inline_keyboard.map((row) =>
      row.map((btn) => {
        if (!btn.style) return btn;
        const { style: _style, ...rest } = btn;
        return rest as InlineButton;
      }),
    ),
  };
}


export type TgUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type TgChat = { id: number; type: string; title?: string; username?: string };

export type TgPhotoSize = { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number };

export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TgPhotoSize[];
  document?: { file_id: string; file_name?: string; mime_type?: string };
  sticker?: { file_id: string; emoji?: string };
  contact?: { phone_number: string; first_name: string };
  reply_to_message?: TgMessage;
  successful_payment?: { currency: string; total_amount: number; invoice_payload: string };
};

export type TgCallbackQuery = {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
  inline_message_id?: string;
};

export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
  my_chat_member?: {
    chat: TgChat;
    from: TgUser;
    new_chat_member: { status: string };
  };
  channel_post?: TgMessage;
};

export class TelegramError extends Error {
  code: number;
  description: string;
  constructor(code: number, description: string) {
    super(`${code}: ${description}`);
    this.code = code;
    this.description = description;
  }
}

const API = (process.env.TELEGRAM_API_BASE || "https://api.telegram.org").replace(/\/+$/, "");

let cachedEmojiMap: { map: Record<string, string>; at: number } = { map: {}, at: 0 };
let cachedUsername = "";

export function setEmojiMap(map: Record<string, string>): void {
  cachedEmojiMap = { map: map ?? {}, at: Date.now() };
}

export function getEmojiMap(): Record<string, string> {
  return cachedEmojiMap.map;
}

export function setBotUsername(username: string): void {
  cachedUsername = username;
}

export function botUsername(): string {
  return cachedUsername;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const EMOJI_SRC =
  "(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?)*)";

export function normEmoji(value: string): string {
  return String(value || "").replace(/\uFE0F/g, "");
}

export function leadingEmoji(text: string): string {
  const m = new RegExp(`^\\s*(${EMOJI_SRC})\\s*`, "u").exec(String(text || ""));
  return m ? normEmoji(m[1]) : "";
}

/** يحوّل الإيموجي العادي إلى <tg-emoji> إن توفّر معرّف متحقَّق منه */
export function richify(text: string): string {
  const map = cachedEmojiMap.map;
  if (!Object.keys(map).length) return text;
  const re = new RegExp(EMOJI_SRC, "gu");
  return text.replace(re, (m) => {
    const id = map[normEmoji(m)] || map[m];
    return id ? `<tg-emoji emoji-id="${id}">${m}</tg-emoji>` : m;
  });
}

export function stripCustomEmoji(text: string): string {
  return String(text || "").replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1");
}

/** يضبط أيقونة الإيموجي المتحرك على الأزرار إن أمكن */
function decorateKeyboard(keyboard?: InlineKeyboard): InlineKeyboard | undefined {
  if (!keyboard) return undefined;
  const map = cachedEmojiMap.map;
  if (!Object.keys(map).length) return keyboard;
  return {
    inline_keyboard: keyboard.inline_keyboard.map((row) =>
      row.map((btn) => {
        const emoji = leadingEmoji(btn.text);
        const id = emoji ? map[emoji] : "";
        return id ? { ...btn, icon_custom_emoji_id: id } : btn;
      }),
    ),
  } as InlineKeyboard;
}

/* ───────────────────────── استدعاء API ───────────────────────── */

type TgResponse<T> = { ok: boolean; result?: T; description?: string; error_code?: number; parameters?: { retry_after?: number } };

export async function tg<T = unknown>(
  method: string,
  payload: Record<string, unknown> = {},
  opts: { signal?: AbortSignal } = {},
): Promise<T> {
  const token = env.botToken;
  if (!token) throw new TelegramError(500, "TELEGRAM_BOT_TOKEN غير مضبوط");
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: opts.signal,
  });
  const json = (await res.json().catch(() => ({ ok: false, description: "invalid JSON" }))) as TgResponse<T>;
  if (!json.ok) {
    throw new TelegramError(json.error_code ?? res.status, json.description ?? "unknown error");
  }
  return json.result as T;
}

async function tgForm<T>(method: string, form: FormData): Promise<T> {
  const token = env.botToken;
  if (!token) throw new TelegramError(500, "TELEGRAM_BOT_TOKEN غير مضبوط");
  const res = await fetch(`${API}/bot${token}/${method}`, { method: "POST", body: form, cache: "no-store" });
  const json = (await res.json().catch(() => ({ ok: false, description: "invalid JSON" }))) as TgResponse<T>;
  if (!json.ok) throw new TelegramError(json.error_code ?? res.status, json.description ?? "unknown error");
  return json.result as T;
}

const HARD_BLOCK = /bot was blocked by the user|user is deactivated|chat not found|have no rights|PEER_ID_INVALID|CHAT_WRITE_FORBIDDEN/i;

export function isBlockedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return HARD_BLOCK.test(msg);
}

function retryable(err: unknown): number {
  const e = err as { parameters?: { retry_after?: number }; description?: string };
  const wait = Number(e?.parameters?.retry_after ?? 0);
  if (wait > 0) return wait;
  return /too many requests/i.test(String(e?.description ?? "")) ? 1 : 0;
}

/** إرسال رسالة نصية مع احتياط: إيموجي متحرك ← عادي */
export async function sendMessage(
  chatId: number | string,
  html: string,
  keyboard?: InlineKeyboard,
  extra: Record<string, unknown> = {},
): Promise<TgMessage | null> {
  const base: Record<string, unknown> = {
    chat_id: chatId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  };
  const kbd = decorateKeyboard(keyboard);
  if (kbd) base.reply_markup = kbd;

  const plainKbd = kbd ? stripButtonStyles(kbd) : null;

  const attempts: Array<Record<string, unknown>> = [{ ...base, text: richify(html) }, { ...base, text: html }];
  // احتياط: بعض إصدارات تيليجرام القديمة قد ترفض حقل style — نُعيد المحاولة بأزرار بلا ألوان
  if (plainKbd) attempts.push({ ...base, text: html, reply_markup: plainKbd });
  if (kbd && Object.keys(cachedEmojiMap.map).length) {
    attempts.push({ ...base, text: html, reply_markup: keyboard });
  }
  attempts.push({ ...base, text: stripCustomEmoji(html).replace(/<\/?[^>]+>/g, "") });

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      return await tg<TgMessage>("sendMessage", attempt);
    } catch (err) {
      lastErr = err;
      const wait = retryable(err);
      if (wait) await new Promise((r) => setTimeout(r, Math.min(wait, 3) * 1000));
      if (isBlockedError(err)) throw err;
      if (err instanceof TelegramError && /retry after/i.test(err.description)) continue;
      if (err instanceof TelegramError && /can't parse entities|unsupported start tag|can't find end tag|emoji/i.test(err.description)) continue;
      if (err instanceof TelegramError && /button|reply_markup/i.test(err.description)) continue;
      throw err;
    }
  }
  throw lastErr;
}

export async function editMessage(
  chatId: number | string,
  messageId: number,
  html: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  const base: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  const kbd = decorateKeyboard(keyboard);
  if (kbd) base.reply_markup = kbd;
  for (const text of [richify(html), html, stripCustomEmoji(html).replace(/<\/?[^>]+>/g, "")]) {
    try {
      await tg("editMessageText", { ...base, text });
      return;
    } catch (err) {
      const desc = err instanceof TelegramError ? err.description : "";
      if (/message is not modified/i.test(desc)) return;
      if (/no text in the message/i.test(desc)) return;
      continue;
    }
  }
}

export async function answerCallback(id: string, text?: string, alert = false): Promise<void> {
  try {
    await tg("answerCallbackQuery", {
      callback_query_id: id,
      text: text ? text.slice(0, 190) : undefined,
      show_alert: alert,
    });
  } catch {
    /* ignore */
  }
}

export async function sendChatAction(chatId: number | string, action = "typing"): Promise<void> {
  try {
    await tg("sendChatAction", { chat_id: chatId, action });
  } catch {
    /* ignore */
  }
}

type PhotoSource = { fileId?: string | null; url?: string | null; buffer?: { data: Buffer; filename: string } };

/** إرسال صورة (file_id أو رابط عام أو ملف) مع نص وأزرار */
export async function sendPhoto(
  chatId: number | string,
  source: PhotoSource,
  caption: string,
  keyboard?: InlineKeyboard,
): Promise<TgMessage | null> {
  const kbd = decorateKeyboard(keyboard);
  if (source.buffer) {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", richify(caption));
    form.append("parse_mode", "HTML");
    if (kbd) form.append("reply_markup", JSON.stringify(kbd));
    form.append("photo", new Blob([new Uint8Array(source.buffer.data)], { type: "image/jpeg" }), source.buffer.filename);
    try {
      return await tgForm<TgMessage>("sendPhoto", form);
    } catch {
      /* fallback below */
    }
  }
  const photo = source.fileId || source.url;
  if (!photo) return sendMessage(chatId, caption, keyboard);
  for (const attempt of [
    { chat_id: chatId, photo, caption: richify(caption), parse_mode: "HTML", reply_markup: kbd },
    { chat_id: chatId, photo, caption: stripCustomEmoji(caption), parse_mode: "HTML", reply_markup: keyboard },
  ]) {
    try {
      return await tg<TgMessage>("sendPhoto", attempt);
    } catch {
      continue;
    }
  }
  return sendMessage(chatId, caption, keyboard);
}

/** نسخة مختصرة شائعة: صورة + نص (تستخدم ملف الصورة إن وُجد وإلا الرابط) */
export async function sendProductCard(
  chatId: number | string,
  opts: { fileId?: string | null; imageUrl?: string | null; caption: string; keyboard?: InlineKeyboard },
): Promise<TgMessage | null> {
  return sendPhoto(chatId, { fileId: opts.fileId, url: opts.imageUrl }, opts.caption, opts.keyboard);
}

/** إرسال ملف (يحجز buffer في memory — الملفات فوق 45MB ترجع null وتقلب كـ error للمستدعي) */
export async function sendDocument(
  chatId: number | string,
  file: Buffer,
  filename: string,
  caption?: string,
): Promise<TgMessage | null> {
  if (!file || file.length === 0 || file.length > 45 * 1024 * 1024) return null;
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", richify(caption));
    form.append("parse_mode", "HTML");
  }
  form.append(
    "document",
    new Blob([new Uint8Array(file)], { type: "application/octet-stream" }),
    filename,
  );
  try {
    return await tgForm<TgMessage>("sendDocument", form);
  } catch {
    /* فشل الإرسال كملف — نعيد null للمستدعي */
    return null;
  }
}

/* ───────────────────────── معلومات البوت ───────────────────────── */

export type BotIdentity = { id: number; username: string; first_name: string };

export async function getMe(): Promise<BotIdentity | null> {
  try {
    const me = await tg<BotIdentity & { is_bot: boolean }>("getMe");
    if (me?.username) setBotUsername(me.username);
    return me;
  } catch (err) {
    console.error("[telegram] getMe failed", err);
    return null;
  }
}

export async function getWebhookInfo(): Promise<{
  url: string;
  pending_update_count: number;
  last_error_message?: string;
  last_error_date?: number;
} | null> {
  try {
    return await tg("getWebhookInfo");
  } catch {
    return null;
  }
}

export async function setWebhook(url: string, secret: string): Promise<boolean> {
  try {
    await tg("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query", "edited_message", "channel_post", "my_chat_member"],
      drop_pending_updates: true,
      max_connections: 40,
    });
    return true;
  } catch (err) {
    console.error("[telegram] setWebhook failed", err);
    return false;
  }
}

export async function setMyCommands(): Promise<void> {
  try {
    await tg("setMyCommands", {
      commands: [
        { command: "start", description: "🏠 القائمة الرئيسية" },
        { command: "shop", description: "🛍 المتجر والعروض" },
        { command: "usd", description: "💵 بيع دولار للمالك" },
        { command: "orders", description: "🧾 طلباتي" },
        { command: "support", description: "💬 الدعم الفني" },
        { command: "account", description: "👤 حسابي" },
        { command: "admin", description: "🛡 لوحة الإدارة (للمالك)" },
        { command: "help", description: "ℹ️ المساعدة" },
      ],
    });
    // لا تطبيق مصغّر: زر المتجر يُلغى ويبقى زر القائمة العادي (commands)
    await tg("setChatMenuButton", { menu_button: { type: "commands" } }).catch(() => {});
  } catch (err) {
    console.error("[telegram] setMyCommands failed", err);
  }
}

export async function getChatMemberStatus(chat: string, userId: number): Promise<string | null> {
  try {
    const member = await tg<{ status: string }>("getChatMember", { chat_id: chat, user_id: userId });
    return member?.status ?? null;
  } catch (err) {
    const msg = err instanceof TelegramError ? err.description : "";
    if (/user not found|participant_id_invalid/i.test(msg)) return "left";
    return null; // خطأ تقني (البوت ليس مشرفاً…): لا نعاقب المستخدم
  }
}

export async function getChat(chat: string): Promise<{ id: number; title?: string; username?: string } | null> {
  try {
    return await tg("getChat", { chat_id: chat });
  } catch {
    return null;
  }
}

export async function getUserAvatarFileId(userId: number): Promise<string | null> {
  try {
    const res = await tg<{ total_count: number; photos: TgPhotoSize[][] }>("getUserProfilePhotos", {
      user_id: userId,
      limit: 1,
      offset: 0,
    });
    return res?.photos?.[0]?.at(-1)?.file_id ?? null;
  } catch {
    return null;
  }
}

/** إنشاء رابط ملف مؤقت من تيليجرام ثم تنزيله (للصور والأفاتار) */
export async function downloadFile(fileId: string): Promise<{ data: Buffer; mime: string } | null> {
  try {
    const file = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!file?.file_path) return null;
    const res = await fetch(`${API}/file/botid:${env.botToken.split(":")[1]}/${file.file_path}`, { cache: "no-store" });
    if (!res.ok) {
      const res2 = await fetch(`${API}/file/bot${env.botToken}/${file.file_path}`, { cache: "no-store" });
      if (!res2.ok) return null;
      const buf = Buffer.from(await res2.arrayBuffer());
      return { data: buf, mime: res2.headers.get("content-type") || "image/jpeg" };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf, mime: res.headers.get("content-type") || "image/jpeg" };
  } catch {
    return null;
  }
}
