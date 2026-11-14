/* ⛔️ الملصقات تحيّدو قاع بقرار من المالك — الملف بلا محتوى على قصده.
   (المولّد `scripts/gen-stickers.mjs` تحيّد هو الآخر.) */

export type BakedItem = { emoji: string; tgsB64: string; webp: string | null; png: string | null; webm: string | null; webmBytes: number };
export type BakedPack = { id: string; kind: "welcome" | "react" | "more" | "win" | "shop"; title: string; format?: string; items: BakedItem[] };

/** قائمة فارغة: ما كاين حتى ملف ملصق مضمّن */
export const STICKER_ASSETS: BakedPack[] = [];
