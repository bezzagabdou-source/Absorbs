/**
 * ✨ emojiLayer.ts — الطبقة الوسطية (دوال صافية بلا أي استيراد).
 *
 * كل رسالة خارجة من البوت تمر من هنا قبل تيليجرام (telegram.ts ← tgCall):
 *   • النص   → <tg-emoji emoji-id="ID">🔥</tg-emoji> لكل إيموجي عندو ID متحقَّق منو.
 *   • الأزرار → icon_custom_emoji_id (مع الحفاظ على style وcallback_data والترتيب).
 *   • سلّم الاحتياط: (0) كامل ← (1) نص متحرك بأزرار عادية ← (2) الأصل كما هو ← (3) نص خام.
 *
 * ما كاين هنا حتى ID مكتوب باليد: كل ID يجي من الخريطة (قاعدة البيانات) عبر `lookup`.
 */

export type EmojiMode = "animated" | "stickers" | "plain";

/** متتاليات الإيموجي: أعلام، keycaps، ZWJ، ألوان البشرة */
const EMOJI_SRC =
  "(?:\\p{Regional_Indicator}{2}|[0-9#*]\\uFE0F?\\u20E3|\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?(?:\\u200D\\p{Extended_Pictographic}(?:\\uFE0F|[\\u{1F3FB}-\\u{1F3FF}])?)*)";
const emojiRe = () => new RegExp(EMOJI_SRC, "gu");
const LEADING_RE = new RegExp(`^\\s*(${EMOJI_SRC})\\s*`, "u");
const TRAILING_RE = new RegExp(`\\s*(${EMOJI_SRC})\\s*$`, "u");

/** مفتاح موحّد: بلا U+FE0F (⭐️ = ⭐) */
export function normEmoji(value: string): string {
  return String(value || "").replace(/\uFE0F/g, "");
}

/** نفس المفتاح بلا لون البشرة (احتياط للبحث) */
function withoutTone(value: string): string {
  return value.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
}

export function hasEmoji(text: string): boolean {
  return emojiRe().test(String(text || ""));
}

export function listEmojis(text: string): string[] {
  return (String(text || "").match(emojiRe()) || []).map(normEmoji);
}

export type Lookup = (emoji: string) => string;

/** نبني دالة بحث من خريطة {emoji → id} */
export function lookupFrom(map: Record<string, { id: string } | undefined>): Lookup {
  return (emoji) => {
    const key = normEmoji(emoji);
    return map[key]?.id || map[withoutTone(key)]?.id || "";
  };
}

export function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** نحيّد وسوم tg-emoji ونخليو الإيموجي العادي */
export function stripCustomEmoji(text: string): string {
  return String(text || "").replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1");
}

/** HTML → نص خام (آخر درجة في سلّم الاحتياط) */
export function stripTags(html: string): string {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** حد تيليجرام: 100 كيان في الرسالة — نخليو هامش */
export const MAX_CUSTOM_PER_MESSAGE = 90;

/**
 * نبدّل الإيموجي العادي في HTML بإيموجي متحرك.
 * ما نلمسوش: الوسوم نفسها، محتوى <code>/<pre>، ولا tg-emoji موجودة.
 */
export function decorateHtml(html: string, lookup: Lookup, max = MAX_CUSTOM_PER_MESSAGE): { text: string; count: number } {
  const input = String(html ?? "");
  if (!input) return { text: input, count: 0 };
  let count = (input.match(/<tg-emoji/g) || []).length;
  let added = 0;
  let blocked = 0; // داخل code/pre/tg-emoji
  const parts = input.split(/(<[^>]+>)/g);
  const out = parts.map((part, index) => {
    if (index % 2 === 1) {
      const m = /^<\s*(\/)?\s*([a-zA-Z-]+)/.exec(part);
      if (m && /^(code|pre|tg-emoji)$/i.test(m[2])) blocked = Math.max(0, blocked + (m[1] ? -1 : 1));
      return part;
    }
    if (blocked > 0 || !part) return part;
    return part.replace(emojiRe(), (match) => {
      if (count >= max) return match;
      const id = lookup(match);
      if (!id) return match;
      count += 1;
      added += 1;
      return `<tg-emoji emoji-id="${id}">${match}</tg-emoji>`;
    });
  });
  return { text: out.join(""), count: added };
}

/* ───────────────────────────── الأزرار ───────────────────────────── */

type AnyButton = Record<string, unknown> & { text?: string; icon_custom_emoji_id?: string; style?: string };
type AnyMarkup = { inline_keyboard?: AnyButton[][]; keyboard?: (AnyButton | string)[][] } & Record<string, unknown>;

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

/** لون الزر حسب معناه (غير إلا ما كانش عندو style) — للوضع الغني */
function autoStyle(emoji: string, text: string): string {
  const e = normEmoji(emoji);
  if (/^(✅|✔|☑|🟢|🎁|🛍|💰)$/u.test(e)) return "success";
  if (/^(❌|🚫|⛔|🔴|🗑)$/u.test(e)) return "danger";
  if (/^(🏆|⭐|🚀|🔗|👤|🏁|🎯)$/u.test(e)) return "primary";
  if (/رجوع|BACK|القائمة الرئيسية|الرئيسية/.test(text)) return "";
  return "";
}

/**
 * أيقونات متحركة للأزرار.
 *  - strip=true  → نحيّدو الإيموجي من النص (الأيقونة تعوّضو) — غير إلا تأكّدنا أن تيليجرام كيقبل الأيقونات.
 *  - strip=false → نخليو الإيموجي في النص (ما نخسرو والو إلا سقطت الأيقونة).
 */
export function decorateMarkup<T>(
  markup: T,
  lookup: Lookup | null,
  opts: { strip?: boolean; styles?: boolean } = {},
): { markup: T; icons: number } {
  const src = markup as unknown as AnyMarkup | undefined;
  if (!src || typeof src !== "object") return { markup, icons: 0 };
  const rows = Array.isArray(src.inline_keyboard) ? "inline_keyboard" : Array.isArray(src.keyboard) ? "keyboard" : "";
  if (!rows) return { markup, icons: 0 };
  let icons = 0;
  const next = clone(src);
  next[rows] = ((next[rows] as (AnyButton | string)[][]) || []).map((row) =>
    (row || []).map((raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const btn = raw as AnyButton;
      const text = String(btn.text || "");
      const lead = LEADING_RE.exec(text);
      const trail = lead ? null : TRAILING_RE.exec(text);
      const emoji = lead?.[1] || trail?.[1] || "";
      if (opts.styles && !btn.style && emoji) {
        const style = autoStyle(emoji, text);
        if (style) btn.style = style;
      }
      if (!lookup || btn.icon_custom_emoji_id || !emoji) return btn;
      const id = lookup(emoji);
      if (!id) return btn;
      btn.icon_custom_emoji_id = id;
      icons += 1;
      if (opts.strip) {
        const rest = (lead ? text.slice(lead[0].length) : text.slice(0, text.length - (trail?.[0].length || 0))).trim();
        if (rest) btn.text = rest;
      }
      return btn;
    }),
  ) as never;
  return { markup: next as unknown as T, icons };
}

/** أزرار بلا أي إضافة جديدة (لا icon ولا style) — آخر احتياط */
export function bareMarkup<T>(markup: T): T {
  const src = markup as unknown as AnyMarkup | undefined;
  if (!src || typeof src !== "object") return markup;
  const next = clone(src);
  for (const key of ["inline_keyboard", "keyboard"] as const) {
    if (!Array.isArray(next[key])) continue;
    next[key] = (next[key] as (AnyButton | string)[][]).map((row) =>
      (row || []).map((raw) => {
        if (!raw || typeof raw !== "object") return raw;
        const btn = { ...(raw as AnyButton) };
        delete btn.icon_custom_emoji_id;
        delete btn.style;
        return btn;
      }),
    ) as never;
  }
  return next as unknown as T;
}

/* ─────────────────────── تخصيص الإيموجي حسب المعنى ─────────────────────── */

/** قواعد: كلمة مفتاحية → إيموجي مناسب (للرسائل اللي ما فيها حتى إيموجي) */
const ACCENT_RULES: [RegExp, string][] = [
  [/مبروك|تهانينا|فزت|ربحت|فائز/, "🎉"],
  [/ممنوع|محظور|غير مسموح|للإدارة فقط|للمالك فقط/, "🚫"],
  [/خطأ|غلط|فشل|تعذّر|تعذر|ماشي صحيح|غير صالح/, "⚠️"],
  [/جائزة|جوائز|هدية|المتجر|استبدال/, "🎁"],
  [/نقاط|نقطة|رصيد/, "⭐"],
  [/مسابق|ترتيب|المتصدر/, "🏆"],
  [/رابط|دعوة|إحال|دعوات/, "🔗"],
  [/حساب|ملفك|بياناتك/, "👤"],
  [/تمّ|تم |نجح|بنجاح|تحقّق/, "✅"],
  [/مرحبا|أهلا|اهلا|مرحبًا/, "👋"],
  [/انتظر|لحظة|جاري/, "⏳"],
];

/** نزيدو إيموجي واحد مناسب للمعنى في أول الرسالة — غير إلا كانت الرسالة بلا إيموجي */
export function accentHtml(html: string): { text: string; added: number } {
  const input = String(html ?? "");
  if (!input.trim() || hasEmoji(input)) return { text: input, added: 0 };
  if (/^\s*<(pre|code|blockquote)/i.test(input)) return { text: input, added: 0 };
  const visible = stripTags(input).slice(0, 400);
  for (const [re, emoji] of ACCENT_RULES) {
    if (re.test(visible)) return { text: `${emoji} ${input}`, added: 1 };
  }
  return { text: input, added: 0 };
}

/* ───────────────────────── الخطة البديلة: تنسيق غني ───────────────────────── */

const SEPARATOR = "━━━━━━━━━━━━";

function balanced(html: string): boolean {
  const stack: string[] = [];
  const re = /<\s*(\/)?\s*([a-zA-Z-]+)[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[2].toLowerCase();
    if (m[1]) {
      if (stack.pop() !== tag) return false;
    } else stack.push(tag);
  }
  return stack.length === 0;
}

/**
 * عنوان عريض + فاصل + Blockquote للجسم. ما كتبدّلش حتى كلمة — غير الشكل.
 * كترجع النص كما هو إلا كان التنسيق خطير (وسوم ماشي متوازنة / pre / blockquote).
 */
export function richFormat(html: string): string {
  const input = String(html ?? "");
  const lines = input.split("\n");
  if (lines.length < 3 || input.length > 3500) return input;
  if (/<(pre|blockquote)/i.test(input) || input.includes(SEPARATOR)) return input;
  const title = lines[0];
  let start = 1;
  while (start < lines.length && !lines[start].trim()) start += 1;
  const body = lines.slice(start).join("\n");
  if (!title.trim() || !body.trim() || !balanced(title) || !balanced(body)) return input;
  const boldTitle = /<b>/i.test(title) ? title : `<b>${title}</b>`;
  return `${boldTitle}\n${SEPARATOR}\n<blockquote>${body}</blockquote>`;
}

/** أي ملصق يسبق الرسالة المهمة؟ (ترحيب / فوز / قبول) — كترجع إيموجيات مرشّحة بالترتيب */
export function stickerCue(html: string): string[] {
  const visible = stripTags(String(html || "")).slice(0, 300);
  if (/🎉|🥳|مبروك|تهانينا|فزت|ربحت/.test(visible)) return ["🎉", "🥳", "🏆", "🤩"];
  if (/🏆/.test(visible.split("\n")[0] || "")) return ["🏆", "🎉"];
  if (/تم قبول|تمّت الموافقة|تم الاستبدال|تمّ الاستبدال|طلبك مقبول/.test(visible)) return ["✅", "👍", "🎁"];
  if (/^\s*(👋|🔥)?\s*(مرحبا|أهلا|اهلا)/.test(visible)) return ["👋", "🤗", "😊", "🔥"];
  return [];
}

/* ───────────────────────────── سلّم المحاولات ───────────────────────────── */

export type LayerOptions = {
  mode: EmojiMode;
  /** هل نحاولو الإيموجي المتحرك في النص؟ */
  text: boolean;
  /** هل نحاولو أيقونات الأزرار؟ */
  icons: boolean;
  /** نحيّدو الإيموجي من نص الزر (غير إلا كانت الأيقونات مؤكَّدة) */
  strip: boolean;
  /** إرسال جماعي (بث): بلا تخصيص ولا تنسيق — غير تحويل الإيموجي */
  bulk: boolean;
  /** محادثة خاصة؟ (الإضافات حسب المعنى غير في الخاص) */
  privateChat: boolean;
};

export type Attempt = { level: 0 | 1 | 2 | 3; payload: Record<string, unknown>; animated: number; icons: number };

/** الحقل اللي فيه النص حسب الطريقة */
export function textFieldOf(method: string): "text" | "caption" | "media" | "" {
  if (method === "sendMessage" || method === "editMessageText") return "text";
  if (method === "editMessageMedia") return "media";
  if (/^(sendPhoto|sendVideo|sendAnimation|sendDocument|sendAudio|sendVoice|editMessageCaption|copyMessage)$/.test(method)) return "caption";
  return "";
}

/** الطرق اللي كتمر من الطبقة */
export const CONTENT_METHODS = new Set([
  "sendMessage",
  "editMessageText",
  "sendPhoto",
  "sendVideo",
  "sendAnimation",
  "sendDocument",
  "sendAudio",
  "sendVoice",
  "editMessageCaption",
  "editMessageMedia",
  "editMessageReplyMarkup",
  "copyMessage",
  "answerCallbackQuery",
]);

function readText(method: string, payload: Record<string, unknown>): { html: string; mode: string; has: boolean } {
  const field = textFieldOf(method);
  if (field === "media") {
    const media = (payload.media || {}) as Record<string, unknown>;
    return { html: String(media.caption ?? ""), mode: String(media.parse_mode || ""), has: typeof media.caption === "string" };
  }
  if (!field) return { html: "", mode: "", has: false };
  return { html: String(payload[field] ?? ""), mode: String(payload.parse_mode || ""), has: typeof payload[field] === "string" };
}

function writeText(method: string, payload: Record<string, unknown>, html: string, parseMode: string | null): Record<string, unknown> {
  const field = textFieldOf(method);
  const next = { ...payload };
  if (field === "media") {
    const media: Record<string, unknown> = { ...((payload.media || {}) as Record<string, unknown>), caption: html };
    if (parseMode) media.parse_mode = parseMode;
    else delete media.parse_mode;
    next.media = media;
    return next;
  }
  if (!field) return next;
  next[field] = html;
  if (parseMode) next.parse_mode = parseMode;
  else delete next.parse_mode;
  return next;
}

/**
 * نبنيو قائمة المحاولات لطلب واحد. المحاولة الأخيرة ديما آمنة.
 * `payload` ما كيتبدّلش (كل محاولة نسخة جديدة).
 */
export function buildAttempts(
  method: string,
  input: Record<string, unknown>,
  lookup: Lookup,
  opts: LayerOptions,
): Attempt[] {
  // مفاتيح داخلية ما تمشيش لتيليجرام
  const payload: Record<string, unknown> = { ...input };
  delete payload.__ctx;

  // إشعار الزر: نص خام فقط (تيليجرام ما كيقبلش كيانات هنا)
  if (method === "answerCallbackQuery") {
    if (typeof payload.text === "string") payload.text = stripTags(stripCustomEmoji(payload.text)).slice(0, 200);
    return [{ level: 2, payload, animated: 0, icons: 0 }];
  }

  const original = payload;
  const src = readText(method, original);
  const markup = original.reply_markup;
  const hasEntities = Array.isArray(original.entities) || Array.isArray(original.caption_entities);
  const htmlMode = src.mode.toUpperCase() === "HTML";
  const plainMode = !src.mode && !hasEntities;
  const canText = src.has && src.html.length > 0 && (htmlMode || plainMode);

  const attempts: Attempt[] = [];
  const push = (attempt: Attempt) => {
    const key = JSON.stringify(attempt.payload);
    if (!attempts.some((a) => JSON.stringify(a.payload) === key)) attempts.push(attempt);
  };

  if (opts.mode !== "plain") {
    // النص الأساسي بصيغة HTML (النص الخام نهرّبوه — escape)
    let html = canText ? (htmlMode ? src.html : escapeHtml(src.html)) : "";
    let touched = false;
    if (canText && !opts.bulk && opts.privateChat && (method === "sendMessage" || method === "editMessageText")) {
      const accent = accentHtml(html);
      if (accent.added) {
        html = accent.text;
        touched = true;
      }
      if (opts.mode === "stickers") {
        const rich = richFormat(html);
        if (rich !== html) {
          html = rich;
          touched = true;
        }
      }
    }
    const deco = canText && opts.text && opts.mode === "animated" ? decorateHtml(html, lookup) : { text: html, count: 0 };
    const textChanged = canText && (deco.count > 0 || touched);
    const withText = (base: Record<string, unknown>) => (textChanged ? writeText(method, base, deco.text, "HTML") : base);

    const kb = markup
      ? decorateMarkup(markup, opts.icons && opts.mode === "animated" ? lookup : null, {
          strip: opts.strip,
          styles: opts.mode === "stickers" && !opts.bulk,
        })
      : { markup, icons: 0 };
    const kbChanged = Boolean(markup) && JSON.stringify(kb.markup) !== JSON.stringify(markup);

    // (0) كامل: نص متحرك + أيقونات أزرار
    if (textChanged || kbChanged) {
      push({ level: 0, payload: withText(kbChanged ? { ...original, reply_markup: kb.markup } : original), animated: deco.count, icons: kb.icons });
    }
    // (1) نص متحرك + أزرار عادية (كما كتبها الكود، مع style)
    if (textChanged && kbChanged) push({ level: 1, payload: withText(original), animated: deco.count, icons: 0 });
  }

  // (2) الأصل كما هو: نص وأزرار عادية
  push({ level: 2, payload: original, animated: 0, icons: 0 });

  // (3) آخر احتياط: نص خام بلا parse_mode وأزرار بلا style
  if (src.has && htmlMode) {
    const raw = writeText(method, original, stripTags(src.html), null);
    push({ level: 3, payload: markup ? { ...raw, reply_markup: bareMarkup(markup) } : raw, animated: 0, icons: 0 });
  } else if (markup) {
    push({ level: 3, payload: { ...original, reply_markup: bareMarkup(markup) }, animated: 0, icons: 0 });
  }
  return attempts;
}

/** أخطاء ما عندها علاقة بالمحتوى — إعادة المحاولة ما تنفع فيها والو */
const NON_CONTENT_ERROR =
  /message is not modified|chat not found|message to edit not found|message can't be edited|message to delete not found|bot was blocked|user is deactivated|bot was kicked|PEER_ID_INVALID|have no rights|not enough rights|query is too old|query ID is invalid|wrong file|failed to get HTTP URL content|wrong type of the web page content|group chat was upgraded|can't initiate conversation|TOPIC_CLOSED|message thread not found/i;

/** هل نجرّبو المحاولة الموالية؟ (غير أخطاء 400 ديال المحتوى) */
export function shouldDowngrade(result: { ok: boolean; error_code?: number; description?: string; uncertain?: boolean }): boolean {
  if (result.ok || result.uncertain) return false;
  if (Number(result.error_code) !== 400) return false;
  return !NON_CONTENT_ERROR.test(String(result.description || ""));
}

/** كم إيموجي متحرك قبلو تيليجرام فعلاً في جواب الإرسال */
export function acceptedCustomEmoji(result: unknown): string[] {
  const r = (result || {}) as { entities?: { type?: string; custom_emoji_id?: string }[]; caption_entities?: { type?: string; custom_emoji_id?: string }[] };
  return [...(r.entities || []), ...(r.caption_entities || [])]
    .filter((e) => e?.type === "custom_emoji" && e.custom_emoji_id)
    .map((e) => String(e.custom_emoji_id));
}

/** كم أيقونة زر رجّعها تيليجرام في جواب الإرسال */
export function acceptedIcons(result: unknown): string[] {
  const r = (result || {}) as { reply_markup?: { inline_keyboard?: { icon_custom_emoji_id?: string }[][] } };
  return (r.reply_markup?.inline_keyboard || []).flat().map((b) => String(b?.icon_custom_emoji_id || "")).filter(Boolean);
}
