/**
 * ✨ emoji.ts — واجهة قديمة محتفظ بها للتوافق.
 *
 * التحويل للإيموجي المتحرك ولّا مركزي: كل رسالة تدوز من الطبقة الوسطية في
 * `telegram.ts → tgCall` (emojiLayer.ts) والخريطة من قاعدة البيانات (emojiState.ts).
 * لهذا `fx` و`E.*` كيرجّعو الإيموجي العادي — والطبقة هي اللي كتحرّكو، مع الاحتياط.
 */
export { stripCustomEmoji } from "./emojiLayer";

/** متروكة للتوافق: الطبقة الوسطية هي اللي كتبدّل الإيموجي */
export function fx(text: string): string {
  return String(text ?? "");
}

export function stickerStyleOn(): boolean {
  return String(process.env.STICKER_STYLE ?? "1") !== "0";
}

export function stickerId(name: "welcome" | "more"): string {
  if (!stickerStyleOn()) return "";
  const map: Record<string, string> = { welcome: "STICKER_WELCOME", more: "STICKER_MORE" };
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

export const E = {
  gift: () => "🎁",
  star: () => "⭐",
  money: () => "💰",
  user: () => "👤",
  link: () => "🔗",
  trophy: () => "🏆",
  tools: () => "🧩",
  info: () => "ℹ️",
  crown: () => "👑",
  fire: () => "🔥",
  rocket: () => "🚀",
  ball: () => "⚽",
};
