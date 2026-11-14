/**
 * ➕ emojiAdmin.ts — «/addemoji» من داخل البوت: يجيب حزمة إيموجي من تيليجرام
 *    ويخزّنها في التخزين (بدون كتابة ملفات — Vercel ما يسمحش).
 *    الخريطة النهائية = ملف _emoji_ids.json + إضافات المخزون.
 */

const KEY = "emoji:custom";

export type ExtraMap = Record<string, string[]>;

/** 🎭 نجيب حزمة إيموجي ونرجّع [إيموجي, id][]. */
export async function fetchEmojiPack(name: string): Promise<{ ok: boolean; items: { emoji: string; id: string }[]; error?: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
  if (!token) return { ok: false, items: [], error: "ما كاينش توكن" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getStickerSet`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
      cache: "no-store",
    });
    const json = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { sticker_type?: string; stickers?: { emoji?: string; custom_emoji_id?: string }[] };
    };
    if (!json.ok) return { ok: false, items: [], error: json.description || "getStickerSet فشل" };
    if (json.result?.sticker_type && json.result.sticker_type !== "custom_emoji") {
      return { ok: false, items: [], error: "هاد الحزمة ماشي إيموجي مخصص" };
    }
    const items = (json.result?.stickers || [])
      .map((s) => ({ emoji: s.emoji || "❓", id: String(s.custom_emoji_id || "") }))
      .filter((s) => s.id);
    return { ok: true, items };
  } catch (error) {
    return { ok: false, items: [], error: String((error as Error)?.message || error) };
  }
}

/** 💾 نزيد الحزمة للتخزين */
export async function addPack(name: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[A-Za-z0-9_]{3,64}$/.test(name)) return { ok: false, message: "اسم الحزمة ماشي صحيح" };
  const { getStore } = await import("./store");
  const pack = await fetchEmojiPack(name);
  if (!pack.ok || !pack.items.length) return { ok: false, message: pack.error || "ما لقيت حتى إيموجي" };
  const store = getStore();
  const saved = (await store.get<ExtraMap>(KEY)) || {};
  let added = 0;
  for (const { emoji, id } of pack.items) {
    const list = saved[emoji] || (saved[emoji] = []);
    if (!list.includes(id)) {
      list.push(id);
      added += 1;
    }
  }
  await store.set(KEY, saved);
  return { ok: true, message: `تمّت إضافة «${name}» — ${pack.items.length} إيموجي (جديد: ${added})` };
}

/** 📦 إضافات المخزون (تتدمج مع الملف) */
export async function extraMap(): Promise<ExtraMap> {
  try {
    const { getStore } = await import("./store");
    return (await getStore().get<ExtraMap>(KEY)) || {};
  } catch {
    return {};
  }
}
