/**
 * ✨ إيموجيات مخصصة متحركة (Premium Custom Emoji) + احتياط آمن.
 *
 * - كل إيموجي عندو ID رسمي من تيليجرام (custom_emoji_id).
 * - إلا كان البوت ماشي «بريميوم» أو الإيموجي ماشي متاح ليه، تيليجرام يرفض الرسالة،
 *   لهذا كنّا نعاودو الإرسال تلقائياً بالإيموجي العادي (fallback) — بلا ما يتحطّم شي.
 * - داخل الأزرار كنّا نستعملو الإيموجي العادي (تيليجرام ما يقبلش tg-emoji في الأزرار).
 */

/** ID ديال الإيموجي المخصص (تزيدهم من @emojigetida_bot أو من متغير البيئة CUSTOM_EMOJI_IDS) */
export const EMOJI_ID: Record<string, string> = {
  fire: "5368324170671202286",
  trophy: "5368324170671202286",
  gift: "5368324170671202286",
  star: "5368324170671202286",
  rocket: "5368324170671202286",
  crown: "5368324170671202286",
  money: "5368324170671202286",
  user: "5368324170671202286",
  link: "5368324170671202286",
  tools: "5368324170671202286",
  info: "5368324170671202286",
};

/**
 * CUSTOM_EMOJI_IDS="fire=ID,trophy=ID,gift=ID" — يتقرا مرة واحدة ويطغى على القائمة فوق.
 */
function envOverrides(): Record<string, string> {
  const raw = String(process.env.CUSTOM_EMOJI_IDS || "").trim();
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(/[,\n]+/)) {
    const [key, id] = pair.split("=").map((x) => String(x || "").trim());
    if (key && /^\d{5,}$/.test(id || "")) out[key] = id;
  }
  return out;
}
const IDS = { ...EMOJI_ID, ...envOverrides() };

/** غلاف tg-emoji */
export function emoji(key: string, fallback: string): string {
  const id = IDS[key];
  if (!id) return fallback;
  return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

/** عناوين جاهزة */
export const E = {
  gift: () => emoji("gift", "🎁"),
  star: () => emoji("star", "⭐️"),
  money: () => emoji("money", "💰"),
  user: () => emoji("user", "👤"),
  link: () => emoji("link", "🔗"),
  trophy: () => emoji("trophy", "🏆"),
  tools: () => emoji("tools", "🧩"),
  info: () => emoji("info", "ℹ️"),
  crown: () => emoji("crown", "👑"),
  fire: () => emoji("fire", "🔥"),
  rocket: () => emoji("rocket", "🚀"),
};

/** ☑️ تحويل رسالة فيها tg-emoji → نص عادي (لمّا تيليجرام يرفض) */
export function stripCustomEmoji(text: string): string {
  return String(text || "").replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1");
}
