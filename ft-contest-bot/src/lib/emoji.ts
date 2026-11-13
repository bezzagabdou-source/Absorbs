/**
 * ✨ emoji.ts — إيموجيات متحركة (Custom Emoji) للبوت، بلا أي اعتماد خارجي.
 *
 * 1) `node scripts/emoji.mjs sync`  → يجيب الحزم من تيليغرام ويكتب `_emoji_ids.json`.
 * 2) `fx(text)`                     → يبدّل كل إيموجي عادي بواحد متحرك (عشوائي إلا كان أكثر من واحد).
 * 3) `fixKeyboard(kb)`              → أزرار InlineKeyboard بـ icon_custom_emoji_id (بلا إيموجي في النص).
 * 4) احتياط تلقائي                  → telegram.ts يعاود الإرسال بالإيموجي العادي إلا رفض تيليغرام.
 * 5) البيئة                         → EMOJI_MAP ملف آخر، EMOJI_OFF=1 يطفّي كلشي، EMOJI_STRICT=1 بلا عشوائية.
 */
import idsFile from "./_emoji_ids.json";

export type EmojiMap = Record<string, string[]>;

/** خريطة base → [custom_emoji_id,…] (الملف + إضافات /addemoji) */
const BASE_MAP: EmojiMap = (idsFile as EmojiMap) || {};
const EXTRA: EmojiMap = {};

/** 📦 ندمجو إضافات المخزون (تتقرا مرة واحدة لكل نسخة) */
export function hydrate(extra: EmojiMap): void {
  for (const [base, list] of Object.entries(extra || {})) {
    const target = (EXTRA[base] = EXTRA[base] || []);
    for (const id of list || []) if (id && !target.includes(id)) target.push(id);
  }
  rebuild();
}

/** الخريطة الفعّالة */
export const MAP: EmojiMap = {};

function rebuild(): void {
  for (const key of Object.keys(MAP)) delete MAP[key];
  for (const [base, list] of Object.entries(BASE_MAP)) MAP[base] = [...list];
  for (const [base, list] of Object.entries(EXTRA)) MAP[base] = [...(MAP[base] || []), ...list.filter((id) => !(MAP[base] || []).includes(id))];
  rebuildPattern();
}

let BASES: string[] = [];
let PATTERN: RegExp | null = null;

function rebuildPattern(): void {
  BASES = Object.keys(MAP).sort((a, b) => b.length - a.length);
  PATTERN = BASES.length
    ? new RegExp(`(${BASES.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "g")
    : null;
}

rebuild();

/** هل خاصية الإيموجيات مطفية؟ */
function off(): boolean {
  return String(process.env.EMOJI_OFF || "") === "1";
}

/** كل ID موجود في الخريطة (للتشخيص) */
export function allIds(): string[] {
  return [...new Set(Object.values(MAP).flat())];
}

/** قائمة الإيموجيات المحمّلة (للأمر /emojis) */
export function loadedEmojis(): { base: string; count: number }[] {
  return Object.entries(MAP)
    .filter(([, list]) => Array.isArray(list) && list.length)
    .map(([base, list]) => ({ base, count: list.length }));
}

/** ID واحد لإيموجي (عشوائي إلا كان أكثر من نسخة) */
export function idFor(base: string): string {
  const list = MAP[base];
  if (!Array.isArray(list) || !list.length) return "";
  if (list.length === 1 || String(process.env.EMOJI_STRICT || "") === "1") return list[0];
  return list[Math.floor(Math.random() * list.length)];
}


/**
 * ✨ الدالة الوحيدة: fx(text)
 *    - تحوّل كل إيموجي عادي → <tg-emoji emoji-id="ID">🔥</tg-emoji>
 *    - ما تلمسش الوسوم الموجودة (b / code / tg-emoji) ولا الروابط.
 */
export function fx(text: string): string {
  const input = String(text ?? "");
  const pattern = PATTERN;
  if (off() || !pattern || !input) return input;
  // 1) نحميو الإيموجيات المتحركة الموجودة (باش ما يتلصّقوش مرتين)
  const keep: string[] = [];
  const guarded = input.replace(/<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>/g, (m) => {
    keep.push(m);
    return `\u0000${keep.length - 1}\u0000`;
  });
  // 2) نقسّمو النص: الوسوم والروابط ما نبدّلوش فيها
  const parts = guarded.split(/(<[^>]+>|https?:\/\/\S+)/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part; // وسم أو رابط → كيفما هو
      return part.replace(pattern, (match) => {
        const id = idFor(match);
        return id ? `<tg-emoji emoji-id="${id}">${match}</tg-emoji>` : match;
      });
    })
    .join("")
    // 3) نرجّعو الإيموجيات اللي حميناها
    .replace(/\u0000(\d+)\u0000/g, (_, i) => keep[Number(i)] || "");
}

/* ══════════════════════════════════════════════════════════════════════════
   🎭 ملصقات/إيموجيات جاهزة كيما الصورة (SPAM x Panel) — مع إخفاء آمن.
   تتحكّم فيها من البيئة بلا كود:
     STICKER_STYLE=1|0            شغّل/طفّي الملصق مع الترحيب (افتراضي 1)
     STICKER_WELCOME=<file_id>    ملصق رسالة الترحيب
     STICKER_REACTIONS=<id,id,…>  ملصقات «تفاعل» تتبع الترحيب (حتى 3)
     STICKER_MORE=<file_id>       ملصق صفحة «مميزات وأدوات البوت»
   تلقاهم من: صيفط الملصق للبوت وافحص /api/telegram/status → stickers.lastFileId
   ══════════════════════════════════════════════════════════════════════════ */

export function stickerStyleOn(): boolean {
  return String(process.env.STICKER_STYLE ?? "1") !== "0";
}

export function stickerId(name: "welcome" | "more"): string {
  if (!stickerStyleOn()) return "";
  const map: Record<string, string> = {
    welcome: "STICKER_WELCOME",
    more: "STICKER_MORE",
  };
  return String(process.env[map[name]] || "").trim();
}

export function reactionStickers(): string[] {
  if (!stickerStyleOn()) return [];
  return String(process.env.STICKER_REACTIONS || "")
    .split(/[,\n ]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/** ☑️ تحويل رسالة فيها tg-emoji → نص عادي (لمّا تيليجرام يرفض) */
export function stripCustomEmoji(text: string): string {
  return String(text || "").replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1");
}

/* ─────────────────────────── اختصارات للعناوين ─────────────────────────── */

/** عنوان بإيموجي متحرك (احتياط: الإيموجي العادي) */
export function emojiOf(base: string): string {
  const id = idFor(base);
  return id ? `<tg-emoji emoji-id="${id}">${base}</tg-emoji>` : base;
}

export const E = {
  gift: () => emojiOf("🎁"),
  star: () => emojiOf("⭐"),
  money: () => emojiOf("💰"),
  user: () => emojiOf("👤"),
  link: () => emojiOf("🔗"),
  trophy: () => emojiOf("🏆"),
  tools: () => emojiOf("🧩"),
  info: () => emojiOf("ℹ️"),
  crown: () => emojiOf("👑"),
  fire: () => emojiOf("🔥"),
  rocket: () => emojiOf("🚀"),
  ball: () => emojiOf("⚽"),
};

/** خريطة عكسية: ID → الإيموجي الأصلي (باش نرجّعو النص العادي في الاحتياط) */
export function baseOfId(id: string): string {
  for (const [base, list] of Object.entries(MAP)) {
    if ((list || []).includes(id)) return base;
  }
  return "";
}

/** ID عشوائي من الخريطة كلها (للتشخيص/الاختبار) */
export function randomId(): string {
  const all = allIds();
  return all.length ? all[Math.floor(Math.random() * all.length)] : "";
}
