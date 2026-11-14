/**
 * ➕ emojiAdmin.ts — واجهة قديمة للأمر «/addemoji»: كتحوّل للنظام الجديد
 *    (تحقق getStickerSet + تخزين في قاعدة البيانات) — شوف emojiDiscovery.ts.
 */
import { addPackByLink } from "./emojiDiscovery";
import { loadData } from "./emojiState";

export type ExtraMap = Record<string, string[]>;

export async function addPack(name: string): Promise<{ ok: boolean; message: string }> {
  const res = await addPackByLink(name, "command");
  return { ok: res.ok, message: res.message };
}

/** الخريطة الحالية بصيغة {إيموجي: [ids]} (للتشخيص في اللوحة القديمة) */
export async function extraMap(): Promise<ExtraMap> {
  try {
    const data = await loadData();
    const out: ExtraMap = {};
    for (const [emoji, entry] of Object.entries(data.map)) out[emoji] = [entry.id, ...(entry.alts || []).map((a) => a.id)];
    return out;
  } catch {
    return {};
  }
}
