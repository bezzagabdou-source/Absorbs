/* ══════════════════════════════════════════════════════════════════════════
   🎭 ملصقات متحركة + إيموجيات مخصّصة — مصدر حقيقي، بلا file_ids يدوية.

   سبب «ما تظهرش الملصقات» قبل: الملصق كان مربوط بمتغيّرات بيئة فارغة
   (STICKER_WELCOME / STICKER_MORE / STICKER_REACTIONS). هنا ولّينا المصدر
   لوائح علنية موثّقة (fStik / Stickerify / HStickers / Combot):

     • getStickerSet → file_id حيّ لكل صنف (ترحيب، تفاعل، المزيد، ربح، متجر)
     • cache 10 دقائق + تخزين اللوحة `sticker_sets` يقدّر تبدّل النشرات
     • أي نشر فشل → اللي من وراه، وما كان شي كسرا على الرسالة
     • importEmojiPack(name) → إيموجيات مخصّصة (tg-emoji) من t.me/addemoji
     • stickerGalleryHtml() → معرض HTML حيّ (getFile → صور حقيقية)
   ══════════════════════════════════════════════════════════════════════════ */
import { tgCall } from "./telegram";
import { getStore } from "./store";
import { addPack } from "./emojiAdmin";

export type StickerKind = "welcome" | "react" | "more" | "win" | "shop";

/**
 * روابط علنية تحقّقنا منها من كاتالوجات الملصقات المتحركة:
 *   t.me/AnimatedStickers · t.me/animatedpacks · t.me/AnimatedStickersArchive
 * (نهج نفس البوتات مفتوحة المصدر: laggykiller/sticker-convert,
 *  star-39/moe-sticker-bot, sudoskys/tsticker — حزم علنية + getStickerSet)
 */
const PUBLIC_SETS: Record<StickerKind, string[]> = {
  welcome: ["FredThePug", "ChappyBunny", "LittleCatto", "Milk_Mocha_by_cocopry"],
  react: ["UtyaDuck", "Fromg", "JapaneseShiba", "BananaFun"],
  more: ["HotCherry", "ResistanceDog", "MintyZebra", "Bunnyta"],
  win: ["Friendly_Panda", "TidyTieTom", "EarlWoolf", "OfficeTurkey"],
  shop: ["MelieTheCavy", "HamsterBernard", "firstanimated", "dumbo_fly_elephant"],
};

/** نشرات إيموجي مخصّصة عمومية (t.me/addemoji/<name>) — من @CustomEmojiPacks/@Premiumoji */
export const EMOJI_SETS = [
  "ColorReactions",
  "BirthdayCollection",
  "DogsEmoji",
  "RoundedHamster",
  "neon_td",
  "MasksEmoji",
  "Premium_Icon",
  "AnimatedIconsEmoji",
  "TStarsIcons",
];

const STORE_KEY = "sticker_sets";
const TTL_MS = 10 * 60 * 1000;
const GALLERY_PER_SET = 8;

export type Sticker = { fileId: string; emoji: string; video: boolean };
export type Pack = { name: string; title: string; animated: boolean; video: boolean; total: number; stickers: Sticker[] };

let mem: { at: number; packs: Record<string, Pack | null>; paths: Record<string, string> } | null = null;
function blank(): { at: number; packs: Record<string, Pack | null>; paths: Record<string, string> } {
  if (!mem) mem = { at: 0, packs: {}, paths: {} };
  return mem;
}

/** 🎯 الـ file_id اللي كيقبلو sendSticker (نبدأ بـ file_id نفسه، ومن بعد الوسائط) */
function fileIdOf(s: any): string {
  return String(
    s?.file_id ||
      s?.video?.file_id ||
      s?.animation?.file_id ||
      s?.webm_sticker?.file_id ||
      s?.tgs_sticker?.file_id ||
      s?.png_sticker?.file_id ||
      s?.thumb?.file_id ||
      s?.thumbnail?.file_id ||
      "",
  );
}

/** نجيب النشر من تيليجرام (ملصقات + إيموجي مخصّصة) */
export async function fetchSet(name: string): Promise<Pack | null> {
  const clean = String(name || "").trim().replace(/^https?:\/\/t\.me\/(?:addstickers|addemoji)\//i, "").replace(/[^A-Za-z0-9_]/g, "");
  if (!/^[A-Za-z0-9_]{3,64}$/.test(clean)) return null;
  try {
    const res = await tgCall<any>("getStickerSet", { name: clean });
    const r = res?.result;
    if (!res?.ok || !r) return null;
    const stickers: Sticker[] = (r.stickers || [])
      .map((s: any) => ({ fileId: fileIdOf(s), emoji: String(s?.emoji || ""), video: Boolean(s?.is_video || s?.video || s?.animation) }))
      .filter((s: Sticker) => s.fileId);
    if (stickers.length === 0) return null;
    return {
      name: clean,
      title: String(r.title || clean),
      animated: Boolean(r.is_animated || r.sticker_type === "animated" || (r.stickers || []).some((s: any) => s?.is_animated)),
      video: Boolean(r.is_video || (r.stickers || []).some((s: any) => s?.is_video)),
      total: (r.stickers || []).length,
      stickers,
    };
  } catch {
    return null;
  }
}

/* ─────────────────────────── الاختيار/الصنف ─────────────────────────── */

async function overrides(): Promise<Record<string, string[]> | null> {
  try {
    return await getStore().get<Record<string, string[]>>(STORE_KEY);
  } catch {
    return null;
  }
}

async function setNames(kind: StickerKind): Promise<string[]> {
  const fromStore = await overrides();
  const custom = fromStore?.[kind];
  if (Array.isArray(custom) && custom.length > 0) return custom.map(String);
  const env = String(process.env.STICKER_SETS || "")
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const scoped = env.filter((x) => x.startsWith(`${kind}:`)).map((x) => x.slice(kind.length + 1));
  if (scoped.length > 0) return scoped;
  return PUBLIC_SETS[kind];
}

/** كل نشرات الصنف، cache 10د */
export async function packsFor(kind: StickerKind, force = false): Promise<(Pack | null)[]> {
  const names = await setNames(kind);
  const m = blank();
  const fresh = Date.now() - m.at < TTL_MS;
  if (!force && fresh && names.every((n) => n in m.packs)) return names.map((n) => m.packs[n] ?? null);
  const need = !force && fresh ? names.filter((n) => !(n in m.packs)) : names;
  const got = await Promise.all(need.map((n) => fetchSet(n)));
  need.forEach((n, i) => (m.packs[n] = got[i]));
  if (!m.at || !fresh) m.at = Date.now();
  return names.map((n) => m.packs[n] ?? null);
}

function score(p: Pack): number {
  return (p.animated || p.video ? 100 : 0) + Math.min(p.total, 20);
}

function pick(p: Pack, offset: number): Sticker | null {
  const n = p.stickers.length;
  for (let i = 0; i < n; i++) {
    const s = p.stickers[(offset + i) % n];
    if (s?.fileId) return s;
  }
  return null;
}

function best(packs: (Pack | null)[], offset: number): { fileId: string; setName: string; emoji: string; title: string } | null {
  const ordered = (packs.filter(Boolean) as Pack[]).sort((a, b) => score(b) - score(a));
  for (const p of ordered) {
    const s = pick(p, offset);
    if (s) return { fileId: s.fileId, setName: p.name, emoji: s.emoji, title: p.title };
  }
  return null;
}

export const stickersEnabled = () => String(process.env.STICKER_STYLE ?? "1") !== "0";

/** 🎭 ملصق حيّ لصنف معيّن (null = لا شيء متاح، ما نكسرو والو) */
export async function stickerFor(kind: StickerKind, offset = 0) {
  if (!stickersEnabled()) return null;
  return best(await packsFor(kind), offset);
}

/** صيفط ملصق + تفاعل (مستعمل فـ showWelcome/showMore/showShop) */
export async function sendStickers(chatId: number | string, kind: StickerKind, count = 2): Promise<number> {
  if (!stickersEnabled()) return 0;
  const packs = await packsFor(kind);
  const primary = best(packs, 0);
  let sent = 0;
  if (primary) {
    const res = await tgCall("sendSticker", { chat_id: chatId, sticker: primary.fileId });
    if (res?.ok) sent += 1;
  }
  if (count > 1) {
    const second = best(packs, 1);
    if (second && second.fileId !== primary?.fileId) {
      const res = await tgCall("sendSticker", { chat_id: chatId, sticker: second.fileId });
      if (res?.ok) sent += 1;
    }
  }
  return sent;
}

/* ─────────────────────────── اللوحة / التشخيص ─────────────────────────── */

export async function describeStickers() {
  const kinds: StickerKind[] = ["welcome", "react", "more", "win", "shop"];
  return Promise.all(
    kinds.map(async (kind) => {
      const names = await setNames(kind);
      const packs = await packsFor(kind);
      return {
        kind,
        ready: best(packs, 0) !== null,
        source: (await overrides())?.[kind]?.length ? "panel" : "default",
        sets: names.map((name, i) => ({
          name,
          title: packs[i]?.title || name,
          total: packs[i]?.total || 0,
          animated: Boolean(packs[i]?.animated || packs[i]?.video),
          ok: Boolean(packs[i]),
        })),
      };
    }),
  );
}

/** 🔧 تحديد يدوي من اللوحة: { welcome:["pug"], … } (={} = رجوع للافتراضي) */
export async function saveStickerSets(sets: Record<string, string[]> | null | undefined) {
  const m = blank();
  m.at = 0;
  const clean: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(sets || {})) {
    if (!Array.isArray(v)) continue;
    const names = v.map((x) => String(x).replace(/^https?:\/\/t\.me\/addstickers\//i, "").replace(/[^A-Za-z0-9_]/g, "")).filter((x) => x.length >= 3);
    if (names.length > 0) clean[k] = names.slice(0, 6);
  }
  await getStore().set(STORE_KEY, clean);
  return { ok: true, kinds: Object.keys(clean).length, sets: clean };
}

/** 🔄 أنعش cache (من بعد ما تبدّل النشرات) */
export async function refreshStickers() {
  const m = blank();
  m.at = 0;
  m.packs = {};
  const kinds: StickerKind[] = ["welcome", "react", "more", "win", "shop"];
  const ready = await Promise.all(kinds.map(async (k) => best(await packsFor(k, true), 0) !== null));
  return { ok: true, ready: ready.filter(Boolean).length, of: kinds.length };
}

/** ➕ إيموجيات مخصّصة من t.me/addemoji/<name> → تتدمج فـ tg-emoji */
export async function importEmojiPack(name: string) {
  const clean = String(name || "").trim().replace(/^https?:\/\/t\.me\/addemoji\//i, "").replace(/[^A-Za-z0-9_]/g, "");
  if (!/^[A-Za-z0-9_]{3,64}$/.test(clean)) return { ok: false, message: "جيب اسم النشر: t.me/addemoji/Premium_Icon" };
  const res = await addPack(clean);
  return { ...res, sets: EMOJI_SETS };
}

/* ─────────────────────────── 🖼️ معرض HTML حيّ ─────────────────────────── */

/** 🗂 كل file_ids اللي يعرفهم البوت (للوسيط الآمن `/api/stickers/file`) — من cache */
export async function knownStickerIds(): Promise<Set<string>> {
  const kinds: StickerKind[] = ["welcome", "react", "more", "win", "shop"];
  const out = new Set<string>();
  for (const kind of kinds) {
    for (const pack of await packsFor(kind)) for (const st of pack?.stickers || []) out.add(st.fileId);
  }
  return out;
}

/** معرض HTML: كل صنف + ملصقاته الحقيقية (images) + رابط ⚡️ النشر + حزم الإيموجي */
export async function stickerGalleryHtml(emojiSets: string[] = []): Promise<string> {
  const kinds: StickerKind[] = ["welcome", "react", "more", "win", "shop"];
  const labels: Record<StickerKind, string> = {
    welcome: "🏠 رسالة الترحيب",
    react: "💬 تفاعلات",
    more: "⭐️ مميزات وأدوات",
    win: "🏆 الربح والفوز",
    shop: "🛒 المتجر",
  };
  const sections: string[] = [];
  for (const kind of kinds) {
    const pack = (await packsFor(kind)).find(Boolean) as Pack | undefined;
    if (!pack) {
      sections.push(`<section><h3>${labels[kind]}</h3><p class="none">ماكاين حتى مصدر (تأكد من التوكن/الشبكة)</p></section>`);
      continue;
    }
    const tiles = pack.stickers
      .slice(0, GALLERY_PER_SET)
      .map(
        (s) =>
          `<figure><img loading="lazy" src="/api/stickers/file?id=${encodeURIComponent(s.fileId)}" alt="${esc(s.emoji)}"><figcaption>${esc(s.emoji) || "🎭"}</figcaption></figure>`,
      )
      .join("");
    sections.push(
      `<section><h3>${labels[kind]} <small>${pack.video ? "🎞 فيديو" : pack.animated ? "✨ متحرّك" : "🖼 ثابت"} · ${pack.total}</small></h3><div class="g">${tiles}</div><a class="lnk" href="https://t.me/addstickers/${encodeURIComponent(pack.name)}" target="_blank" rel="noopener">⚡️ ${esc(pack.title)} · t.me/addstickers/${esc(pack.name)}</a></section>`,
    );
  }
  for (const raw of emojiSets) {
    const pack = await fetchSet(raw);
    if (!pack) continue;
    const tiles = pack.stickers
      .slice(0, GALLERY_PER_SET)
      .map(
        (st) =>
          `<figure class="emo"><img loading="lazy" src="/api/stickers/file?id=${encodeURIComponent(st.fileId)}" alt="${esc(st.emoji)}"><figcaption>${esc(st.emoji) || "😀"}</figcaption></figure>`,
      )
      .join("");
    sections.push(
      `<section><h3>😀 <b>${esc(pack.title)}</b> <small>إيموجي مخصّص · ${pack.total}</small></h3><div class="g">${tiles}</div><a class="lnk" href="https://t.me/addemoji/${encodeURIComponent(pack.name)}" target="_blank" rel="noopener">⚡️ زيد الإيموجي · t.me/addemoji/${esc(pack.name)}</a></section>`,
    );
  }
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🎭 ملصقات البوت</title><style>body{margin:0;background:#0b0d12;color:#e8ecf4;font:15px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:18px}h1{font-size:20px;margin:0 0 2px}.sub{color:#8b93a7;margin:0 0 18px}section{background:#121620;border:1px solid #1e2431;border-radius:16px;padding:14px 16px;margin:0 0 14px}h3{margin:0 0 10px;font-size:16px}small{color:#8b93a7;font-weight:400}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px}figure{margin:0;background:#0f131b;border:1px solid #1e2431;border-radius:12px;padding:6px;text-align:center}figure.emo{max-width:64px}figure img,.ph{width:100%;aspect-ratio:1;object-fit:contain;display:block;border-radius:8px}.ph{display:grid;place-items:center;font-size:26px}figcaption{font-size:12px;color:#8b93a7}.lnk{display:inline-block;margin-top:10px;color:#ffb547;text-decoration:none;font-size:13px}.none{color:#8b93a7;margin:0}</style></head><body><h1>🎭 ملصقات البوت وإيموجياته المخصّصة</h1><p class="sub">مصادر حيّة من تيليجرام — اللي هنا هو اللي كيبان للمستخدم فالبوت.</p>${sections.join("")}</body></html>`;
}

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
