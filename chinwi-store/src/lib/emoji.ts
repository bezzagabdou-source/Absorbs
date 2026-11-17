import { getSetting, log, setSetting } from "./db";
import { setEmojiMap, tg, normEmoji } from "./telegram";

/**
 * emoji.ts — الإيموجي المتحرك (Custom Emoji).
 * تيليجرام يسمح للإيموجي المتحرك فقط للبوتات التي تملك يوزرنيم مشترى من Fragment،
 * لذلك الميزة اختيارية: عند التفعيل يقرأ البوت خريطة {إيموجي → custom_emoji_id}
 * ويحوّلها في كل رسالة، وإذا رفضها تيليجرام تُرسل الرسالة بإيموجي عادي تلقائياً.
 */

export async function syncEmojiFromSettings(): Promise<void> {
  const enabled = Boolean(await getSetting<boolean>("emoji_animated"));
  const map = { ...((await getSetting<Record<string, string>>("emoji_map")) ?? {}) } as Record<string, string>;
  setEmojiMap(enabled ? map : {});
}

/** استيراد حزمة إيموجي متحرك: يقبل t.me/addemoji/NAME أو NAME */
export async function syncEmojiSet(input: string): Promise<{ count: number; setName: string }> {
  const raw = String(input || "").trim();
  const name = raw.replace(/^https?:\/\/t\.me\/addemoji\//i, "").replace(/^addemoji\//i, "").replace(/^@/, "").trim();
  if (!name) throw new Error("اكتب اسم حزمة الإيموجي (مثال: t.me/addemoji/PremiumEmoji)");
  const set = await tg<{
    name: string;
    title?: string;
    stickers?: { emoji?: string; custom_emoji_id?: string }[];
  }>("getStickerSet", { name });

  const map = { ...((await getSetting<Record<string, string>>("emoji_map")) ?? {}) } as Record<string, string>;
  let added = 0;
  for (const sticker of set.stickers ?? []) {
    if (!sticker.custom_emoji_id || !sticker.emoji) continue;
    const key = normEmoji(sticker.emoji);
    if (!map[key]) {
      map[key] = sticker.custom_emoji_id;
      added += 1;
    }
  }
  await setSetting("emoji_map", map);
  await setSetting("emoji_animated", true);
  setEmojiMap(map);
  await log("emoji_sync", { set: name, added, total: Object.keys(map).length }, "success", "admin");
  return { count: added, setName: set.name || name };
}

export async function setEmojiEnabled(enabled: boolean): Promise<void> {
  await setSetting("emoji_animated", enabled);
  await syncEmojiFromSettings();
}

export async function emojiStats(): Promise<{ enabled: boolean; count: number }> {
  const enabled = Boolean(await getSetting<boolean>("emoji_animated"));
  const map = ((await getSetting<Record<string, string>>("emoji_map")) ?? {}) as Record<string, string>;
  return { enabled, count: Object.keys(map).length };
}
