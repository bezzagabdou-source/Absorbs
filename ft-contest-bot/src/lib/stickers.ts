/* ══════════════════════════════════════════════════════════════════════════
   🎭 ملصقات البوت المتحركة + الإيموجي المخصّص — مصدر خاص، بلا حيوانات.

   علاش ما كانش كيبان والو قبل: الملصق كان مربوط بمتغيّرات بيئة فارغة.
   دابا المصدر ملصقات **ديالنا**: ملفات TGS (Lottie 512×512 · 3s) مولّدة بـ
   `scripts/gen-stickers.mjs` ومحفوظة فـ `public/stickers/`، كترفع لـ
   تيليجرام مرة وحدة بـ uploadStickerFile، ونخصهم بـ createNewStickerSet،
   ومن بعد file_ids كيتخزنو فالتخزين (`stickers_own`) — بلا متغيّرات بيئة.

   • ensureOwn()   → أول ما يطلب البوت ملصق، كيشغّل الرفع فالخلفية (lock)
   • publishOwn()  → الرفع بنفسه (من اللوحة: what=stickers_publish&apply=1)
   • stickerFor()  → file_id حيّ لكل صنف (welcome/react/more/win/shop)
   • importEmojiPack() → إيموجي مخصّص (tg-emoji) من t.me/addemoji/<name>
   • stickerGalleryHtml() → معرض HTML حيّ
   ══════════════════════════════════════════════════════════════════════════ */
import { tgCall, currentBotToken } from "./telegram";
import { getSettings } from "./settings";
import { getStore } from "./store";
import { addPack } from "./emojiAdmin";
import { STICKER_ASSETS } from "./stickerAssets";

export type StickerKind = "welcome" | "react" | "more" | "win" | "shop";
const KINDS: StickerKind[] = ["welcome", "react", "more", "win", "shop"];

/**
 * 🚫 بلا كلاب ولا حيوانات. هادو نشرة إيموجي عمومية (نفس اللي مكتوبة فأمثلة
 * تيليجرام الرسمية) — كيتستعملو غير غير ما تولّاش ملصقاتنا مرفوعة.
 */
const PUBLIC_SETS: Record<StickerKind, string[]> = {
  welcome: ["AppleStickers", "AndroidStickerSet"],
  react: ["AppleStickers"],
  more: ["AndroidStickerSet", "AppleStickers"],
  win: ["AppleStickers", "AndroidStickerSet"],
  shop: ["AndroidStickerSet", "AppleStickers"],
};

/** نشرات إيموجي مخصّصة عمومية (t.me/addemoji/<name>) — قلوب/نجوم/احتفال، بلا حيوانات */
export const EMOJI_SETS = ["ColorReactions", "BirthdayCollection", "neon_td", "Premium_Icon", "AnimatedIconsEmoji", "TStarsIcons"];

const OWN_KEY = "stickers_own";
const OVERRIDES_KEY = "sticker_sets";
const TTL_MS = 10 * 60 * 1000;
const GALLERY_PER_SET = 8;

export type StickerItem = { fileId: string; emoji: string };
export type OwnSet = { kind: StickerKind; pack: string; title: string; name: string; link: string; created: boolean; note: string };
export type OwnState = { at: number; byKind: Record<string, StickerItem[]>; sets: OwnSet[] };

type ManifestItem = { emoji: string; tgs: string; png?: string | null; webp?: string | null; json: string; bytes: number; tgsB64?: string };
type ManifestPack = { id: string; kind: StickerKind; title: string; format: string; items: ManifestItem[] };

let own: OwnState | null = null;
let lastTry = 0;

/* ─────────────────────────── assistants ─────────────────────────── */

/**
 * 🎟️ التوكن الصحيح = نفس اللي كيستعملو tgCall (مخزّن فاللوحة ← سياق الطلب ← البيئة).
 * القراءة من البيئة وحدها كانت كتعطّي «Unauthorized» حيت التوكن الحقيقي مخزّن فالتخزين.
 */
async function token(): Promise<string> {
  try {
    const t = currentBotToken() || (await getSettings()).botToken || "";
    if (t) return String(t);
  } catch {
    /* نجربو البيئة */
  }
  return String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "");
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** أصل الموقع ديالنا (قراين منو manifest والصور) */
function selfBase(origin = ""): string {
  const forced = String(origin || process.env.PUBLIC_ORIGIN || process.env.APP_URL || "").trim().replace(/\/$/, "");
  if (forced) return forced.replace(/^http:/, "https:");
  const v = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim();
  return v ? `https://${v}` : "";
}

async function overrides(): Promise<Record<string, string[]> | null> {
  try {
    return await getStore().get<Record<string, string[]>>(OVERRIDES_KEY);
  } catch {
    return null;
  }
}

async function setNames(kind: StickerKind): Promise<string[]> {
  const custom = (await overrides())?.[kind];
  if (Array.isArray(custom) && custom.length > 0) return custom.map(String);
  const env = String(process.env.STICKER_SETS || "")
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const scoped = env.filter((x) => x.startsWith(`${kind}:`)).map((x) => x.slice(kind.length + 1));
  if (scoped.length > 0) return scoped;
  return PUBLIC_SETS[kind] || [];
}

/* ─────────────────────────── ملصقاتنا (TGS) ─────────────────────────── */

/** الملصقات مضمّنة فالكود (STICKER_ASSETS) — بلا قراءة ملفات ولا self-fetch */
function bakedPacks(): ManifestPack[] {
  return STICKER_ASSETS.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    format: "tgs",
    items: p.items.map((it) => ({
      emoji: it.emoji,
      tgs: `${p.id}/${it.emoji}`,
      png: it.png,
      webp: it.webp,
      json: "",
      bytes: Math.round((it.tgsB64 || "").length * 0.75),
      tgsB64: it.tgsB64,
    })),
  }));
}

async function loadManifest(origin: string): Promise<{ packs: ManifestPack[]; base: string }> {
  return { packs: bakedPacks(), base: selfBase(origin) };
}

/** معرّف مستخدم صالح لـ uploadStickerFile (المالك/أول مستخدم) */
async function ownerUserId(forced = ""): Promise<string> {
  const direct = String(forced || "").trim();
  if (/^\d{2,20}$/.test(direct)) return direct;
  try {
    const { getSettings } = await import("./settings");
    const settings = await getSettings();
    const admin = String((settings.adminIds || [])[0] || "");
    if (/^\d{2,20}$/.test(admin)) return admin;
    const owner = String(settings.ownerUsername || "");
    if (/^\d{2,20}$/.test(owner)) return owner;
  } catch {
    /* كمل */
  }
  try {
    const { topBalances } = await import("./rewards");
    const top = await topBalances(1);
    if (top[0]?.userId) return String(top[0].userId);
  } catch {
    /* كمل */
  }
  try {
    const { listAllUsers } = await import("./users");
    const all = await listAllUsers(1);
    if (all[0]?.id) return String(all[0].id);
  } catch {
    /* كمل */
  }
  return "";
}

/** رفع ملف واحد → file_id (TGS، وإلا PNG ثابت) */
async function uploadOne(base: string, item: ManifestItem, userId: string): Promise<{ fileId: string; how: string; error: string }> {
  const t = await token();
  if (!t) return { fileId: "", how: "", error: "ما كاينش توكن البوت" };
  const tries: { path: string | null; format: string; type: string; file: string }[] = [
    { path: item.tgs, format: "animated", type: "application/gzip", file: "s.tgs" },
    { path: item.webp || item.png || null, format: "static", type: item.webp ? "image/webp" : "image/png", file: item.webp ? "s.webp" : "s.png" },
  ];
  const errs: string[] = [];
  for (const step of tries) {
    if (!step.path) continue;
    try {
      let buf: ArrayBuffer;
      if (step.format === "animated" && item.tgsB64) {
        const raw = Buffer.from(item.tgsB64, "base64");
        buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      } else {
        if (!base) {
          errs.push(`${step.format}: بلا origin باش نقراو ${step.path}`);
          continue;
        }
        const res = await fetch(`${base}/stickers/${step.path}`, { cache: "force-cache" });
        if (!res.ok) {
          errs.push(`HTTP ${res.status} على /stickers/${step.path}`);
          continue;
        }
        buf = await res.arrayBuffer();
      }
      const fd = new FormData();
      fd.set("user_id", userId);
      fd.set("sticker_format", step.format);
      fd.append("sticker", new Blob([buf], { type: step.type }), step.file);
      const up = await fetch(`https://api.telegram.org/bot${t}/uploadStickerFile`, { method: "POST", body: fd, cache: "no-store" });
      const j = (await up.json().catch(() => ({}))) as { ok?: boolean; description?: string; result?: { file_id?: string } };
      if (j.ok && j.result?.file_id) return { fileId: String(j.result.file_id), how: step.format, error: "" };
      errs.push(`${step.format}: ${String(j.description || `HTTP ${up.status}`).slice(0, 140)}`);
    } catch (e) {
      errs.push(`${step.format}: ${String((e as Error)?.message || e).slice(0, 140)}`);
    }
  }
  return { fileId: "", how: "", error: errs.join(" · ") || "الرفع فشل" };
}

/** 🚀 ارفع ملصقاتنا لـ تيليجرام وخزّن file_ids (apply=1 للرفع الحقيقي) */
export async function publishOwn(opts: { apply?: boolean; origin?: string; userId?: string; only?: string[]; force?: boolean } = {}) {
  const apply = Boolean(opts.apply);
  const { packs, base } = await loadManifest(opts.origin || "");
  if (packs.length === 0)
    return {
      ok: false,
      message: "ما لقيناه حتى ملصق مضمّن — سير `node scripts/gen-stickers.mjs` ومن بعدعاود المحاولة",
      planned: [] as unknown[],
    };
  const usable = packs.filter((p) => !opts.only || opts.only.length === 0 || opts.only.includes(p.kind) || opts.only.includes(p.id));
  if (!apply) {
    return {
      ok: true,
      dry: true,
      base,
      planned: usable.map((p) => ({ kind: p.kind, pack: p.id, title: p.title, count: p.items.length, emojis: p.items.map((i) => i.emoji) })),
      total: usable.reduce((n, p) => n + p.items.length, 0),
    };
  }
  if (!(await token())) return { ok: false, message: "ما كاينش توكن البوت" };
  const userId = await ownerUserId(opts.userId);
  if (!userId) return { ok: false, message: "ما لقيناه حتى معرّف مستخدم (خاص اللوحة تكون فيها مستخدم واحد)" };
  const bot = await tgCall<{ username?: string; id?: number }>("getMe");
  const botName = String(bot.result?.username || "").toLowerCase();
  if (!bot.ok || !botName)
    return {
      ok: false,
      message: `تيليجرام رفض التوكن: ${String(bot.description || "getMe فشل").slice(0, 120)}`,
      planned: [] as unknown[],
    };
  const byKind: Record<string, StickerItem[]> = {};
  const sets: OwnSet[] = [];
  const errors: string[] = [];

  // ♻️ الملفات اللي ترفعات من قبل: ما نعاودوش نرفعوه (file_id صالح للأبد)
  const prevIds = new Map<string, string>();
  try {
    const prev = await ownStickers(true);
    for (const [k, list] of Object.entries(prev?.byKind || {}))
      for (const it of list || []) if (it?.emoji && it?.fileId) prevIds.set(`${k}:${it.emoji}`, String(it.fileId));
  } catch {
    /* أول مرة */
  }
  const doneSets = new Map<string, OwnSet>();
  try {
    for (const st of (await ownStickers(true))?.sets || []) if (st.created && st.name) doneSets.set(st.pack, st);
  } catch {
    /* لا شيء */
  }

  for (const pack of usable) {
    const items: StickerItem[] = [];
    for (const item of pack.items) {
      const cached = prevIds.get(`${pack.kind}:${item.emoji}`);
      if (cached && !opts.force) {
        items.push({ fileId: cached, emoji: item.emoji });
        continue;
      }
      const up = await uploadOne(base, item, userId);
      if (up.fileId) items.push({ fileId: up.fileId, emoji: item.emoji });
      else if (up.error) errors.push(`${pack.id}/${item.emoji}: ${up.error}`);
      await new Promise((r) => setTimeout(r, 120));
    }
    if (items.length === 0) {
      sets.push({ kind: pack.kind, pack: pack.id, title: pack.title, name: "", link: "", created: false, note: "ما تولّا حتى ملف مرفوع" });
      continue;
    }
    byKind[pack.kind] = items;
    const setName = `${pack.id}_by_${(botName.split("@").pop() || "ftbot").replace(/[^a-z0-9_]/g, "")}`;
    let created = false;
    let note = "";
    const old = doneSets.get(pack.id);
    if (old && !opts.force) {
      created = true;
      note = "النشرة موجودة من قبل";
    } else {
      // 🧩 تيليجرام الجديد كيطلب emoji_list (قائمة) — ونسّاو نسخة emoji القديمة إلا رفض
      const mk = (mode: "list" | "one") => ({
        user_id: userId,
        name: setName,
        title: pack.title.slice(0, 50),
        sticker_type: "regular" as const,
        needs_repainting: false,
        format: "animated",
        stickers: items.map((s) => ({
          sticker: s.fileId,
          format: "animated",
          ...(mode === "list" ? { emoji_list: [s.emoji || "⭐️"] } : { emoji: s.emoji || "⭐️" }),
        })),
      });
      for (const mode of ["list", "one"] as const) {
        try {
          const r = await tgCall("createNewStickerSet", mk(mode));
          if (r.ok) {
            created = true;
            note = mode === "list" ? "النشرة تولّت" : "النشرة تولّت (emoji)";
            break;
          }
          const d = String(r.description || "createNewStickerSet فشل");
          note = d.slice(0, 140);
          if (/ALREADY_EXISTS|already exists/i.test(d)) {
            created = true;
            note = "النشرة موجودة — نفس file_ids خدامين";
            break;
          }
          if (!/emoji_list/i.test(d)) break; // مش مسألة الإيموجي → ما نعاودوش
        } catch (e) {
          note = String((e as Error)?.message || e).slice(0, 140);
        }
      }
    }
    sets.push({
      kind: pack.kind,
      pack: pack.id,
      title: pack.title,
      name: created ? setName : "",
      link: created ? `https://t.me/addstickers/${setName}` : "",
      created,
      note,
    });
  }

  const state: OwnState = { at: Date.now(), byKind, sets };
  try {
    await getStore().set(OWN_KEY, state);
  } catch {
    /* cache المحلي خدام */
  }
  own = state;
  return { ok: true, uploaded: Object.values(byKind).reduce((n, l) => n + l.length, 0), bot: botName, sets, errors: errors.slice(0, 8), base };
}

/** حالة ملصقاتنا (من التخزين) */
export async function ownStickers(force = false): Promise<OwnState | null> {
  if (own && !force && Date.now() - own.at < TTL_MS) return own;
  try {
    const saved = await getStore().get<OwnState>(OWN_KEY);
    if (saved && saved.byKind) {
      own = { at: Date.now(), byKind: saved.byKind, sets: saved.sets || [] };
      return own;
    }
  } catch {
    /* لا شيء */
  }
  return own;
}

/** 🔄 شغّل الرفع فالخلفية مرة وحدة كل 10د (بلا ما نبطّو الرسالة) */
export async function ensureOwn(origin = ""): Promise<void> {
  if (!(await token()) || String(process.env.STICKER_AUTO_PUBLISH ?? "1") === "0") return;
  if (Date.now() - lastTry < TTL_MS) return;
  lastTry = Date.now();
  try {
    const store = getStore();
    const lock = await store.setIfAbsent("sticker_publish_lock", { at: Date.now() });
    if (!lock) return;
    void publishOwn({ apply: true, origin }).catch(() => undefined);
  } catch {
    /* لا شيء */
  }
}

/* ─────────────────────────── النشرات العلنية (اختيارية) ─────────────────────────── */

export type Sticker = { fileId: string; emoji: string; video: boolean };
export type Pack = { name: string; title: string; animated: boolean; video: boolean; total: number; stickers: Sticker[] };

let pub: { at: number; packs: Record<string, Pack | null> } | null = null;

function fileIdOf(s: any): string {
  return String(
    s?.file_id || s?.video?.file_id || s?.animation?.file_id || s?.webm_sticker?.file_id || s?.tgs_sticker?.file_id || s?.png_sticker?.file_id || s?.thumbnail?.file_id || "",
  );
}

/** نجيب نشرّة من تيليجرام (اسم من t.me/addstickers/<name>) */
export async function fetchSet(name: string): Promise<Pack | null> {
  const clean = String(name || "").trim().replace(/^https?:\/\/t\.me\/(?:addstickers|addemoji)\//i, "").replace(/[^A-Za-z0-9_]/g, "");
  if (!/^[A-Za-z0-9_]{3,64}$/.test(clean)) return null;
  try {
    const res = await tgCall<any>("getStickerSet", { name: clean });
    const r = res?.result;
    if (!res?.ok || !r) return null;
    const stickers: Sticker[] = (r.stickers || [])
      .map((s: any) => ({ fileId: fileIdOf(s), emoji: String(s?.emoji || ""), video: Boolean(s?.is_video) }))
      .filter((s: Sticker) => s.fileId);
    if (stickers.length === 0) return null;
    return {
      name: clean,
      title: String(r.title || clean),
      animated: Boolean(r.is_animated || (r.stickers || []).some((s: any) => s?.is_animated)),
      video: Boolean(r.is_video || (r.stickers || []).some((s: any) => s?.is_video)),
      total: (r.stickers || []).length,
      stickers,
    };
  } catch {
    return null;
  }
}

/** نشرات علنية (إلا حددتيها) — cache 10د */
export async function packsFor(kind: StickerKind, force = false): Promise<(Pack | null)[]> {
  const names = await setNames(kind);
  if (names.length === 0) return [];
  pub ||= { at: 0, packs: {} };
  const m = pub;
  const fresh = Date.now() - m.at < TTL_MS;
  if (!force && fresh && names.every((n) => n in m.packs)) return names.map((n) => m.packs[n] ?? null);
  const need = !force && fresh ? names.filter((n) => !(n in m.packs)) : names;
  const got = await Promise.all(need.map((n) => fetchSet(n)));
  need.forEach((n, i) => (m.packs[n] = got[i]));
  if (!fresh) m.at = Date.now();
  return names.map((n) => m.packs[n] ?? null);
}

function pickFromPack(p: Pack, offset: number): Sticker | null {
  const n = p.stickers.length;
  for (let i = 0; i < n; i++) {
    const s = p.stickers[(offset + i) % n];
    if (s?.fileId) return s;
  }
  return null;
}

export const stickersEnabled = () => String(process.env.STICKER_STYLE ?? "1") !== "0";

/** 🎭 ملصق جاهز لصنف: ملصقاتنا أولًا، ومن بعد النشرات العلنية */
export async function stickerFor(kind: StickerKind, offset = 0, origin = ""): Promise<{ fileId: string; setName: string; emoji: string; title: string } | null> {
  if (!stickersEnabled()) return null;
  const state = await ownStickers();
  const mine = state?.byKind?.[kind];
  if (mine && mine.length > 0) {
    const one = mine[Math.abs(offset) % mine.length] || mine[0];
    return { fileId: one.fileId, setName: state?.sets?.find((s) => s.kind === kind)?.pack || "own", emoji: one.emoji, title: state?.sets?.find((s) => s.kind === kind)?.title || "ملصقات البوت" };
  }
  void ensureOwn(origin);
  const packs = await packsFor(kind);
  for (const p of packs.filter(Boolean) as Pack[]) {
    const s = pickFromPack(p, offset);
    if (s) return { fileId: s.fileId, setName: p.name, emoji: s.emoji, title: p.title };
  }
  return null;
}

/** صيفط ملصق (+ تفاعل) — بلا كسر على الرسالة */
export async function sendStickers(chatId: number | string, kind: StickerKind, count = 2, origin = ""): Promise<number> {
  if (!stickersEnabled()) return 0;
  let sent = 0;
  let seen = "";
  for (let i = 0; i < Math.max(1, count); i++) {
    const one = await stickerFor(kind, sent > 0 ? i * 3 : i, origin);
    if (!one || one.fileId === seen) continue;
    seen = one.fileId;
    const res = await tgCall("sendSticker", { chat_id: chatId, sticker: one.fileId });
    if (res?.ok) sent += 1;
  }
  return sent;
}

/* ─────────────────────────── اللوحة / التشخيص ─────────────────────────── */

export async function describeStickers() {
  const state = await ownStickers();
  return Promise.all(
    KINDS.map(async (kind) => {
      const mine = state?.byKind?.[kind] || [];
      const meta = state?.sets?.find((s) => s.kind === kind);
      const publicNames = await setNames(kind);
      const packs = publicNames.length ? await packsFor(kind) : [];
      const ready = mine.length > 0 || packs.some((p) => p && p.stickers.length > 0);
      return {
        kind,
        ready,
        source: mine.length > 0 ? "own" : packs.some(Boolean) ? "public" : "none",
        own: { count: mine.length, emojis: mine.map((m) => m.emoji), created: Boolean(meta?.created), link: meta?.link || "", note: meta?.note || "" },
        sets: mine.length > 0 && meta
          ? [{ name: meta.pack, title: meta.title, total: mine.length, animated: true, ok: true }]
          : publicNames.map((name, i) => ({
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

/** 🔧 نشرات بديلة (اسم من t.me/addstickers/<name>) لكل صنف — {} = غير ملصقاتنا */
export async function saveStickerSets(sets: Record<string, string[]> | null | undefined) {
  pub = null;
  const clean: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(sets || {})) {
    if (!Array.isArray(v)) continue;
    const names = v.map((x) => String(x).replace(/^https?:\/\/t\.me\/addstickers\//i, "").replace(/[^A-Za-z0-9_]/g, "")).filter((x) => x.length >= 3);
    if (names.length > 0) clean[k] = names.slice(0, 6);
  }
  await getStore().set(OVERRIDES_KEY, clean);
  return { ok: true, kinds: Object.keys(clean).length, sets: clean };
}

/** 🔄 أنعش: ملصقاتنا + النشرات */
export async function refreshStickers() {
  own = null;
  pub = null;
  lastTry = 0;
  const state = await ownStickers(true);
  const ready = KINDS.filter((k) => (state?.byKind?.[k] || []).length > 0).length;
  return { ok: true, ready, of: KINDS.length, uploaded: ready > 0 };
}

/** ➕ إيموجي مخصّص من t.me/addemoji/<name> */
export async function importEmojiPack(name: string) {
  const clean = String(name || "").trim().replace(/^https?:\/\/t\.me\/addemoji\//i, "").replace(/[^A-Za-z0-9_]/g, "");
  if (!/^[A-Za-z0-9_]{3,64}$/.test(clean)) return { ok: false, message: "جيب اسم النشر: t.me/addemoji/ColorReactions" };
  const res = await addPack(clean);
  return { ...res, sets: EMOJI_SETS };
}

/* ─────────────────────────── 🖼️ معرض HTML حيّ ─────────────────────────── */

/** 🗂 الـ file_ids اللي كنستعملوهم (للمعرض/للوسيط) */
export async function knownStickerIds(): Promise<Set<string>> {
  const out = new Set<string>();
  const state = await ownStickers();
  for (const list of Object.values(state?.byKind || {})) for (const s of list) out.add(s.fileId);
  for (const kind of KINDS) for (const pack of await packsFor(kind)) for (const st of pack?.stickers || []) out.add(st.fileId);
  return out;
}

/** معرض HTML: ملصقاتنا (PNG بوستر) + النشرات العلنية + حزم الإيموجي */
export async function stickerGalleryHtml(emojiSets: string[] = [], origin = ""): Promise<string> {
  const labels: Record<StickerKind, string> = { welcome: "🏠 الترحيب", react: "💬 التفاعلات", more: "⭐️ المميزات", win: "🏆 الربح", shop: "🛒 المتجر" };
  const sections: string[] = [];
  const { packs } = await loadManifest(origin);
  for (const kind of KINDS) {
    const pack = packs.find((p) => p.kind === kind);
    const state = await ownStickers();
    const live = (state?.byKind?.[kind] || []).length;
    if (pack?.items?.length) {
      const tiles = pack.items
        .slice(0, GALLERY_PER_SET)
        .map((it) => {
          const img = it.png ? `<img loading="lazy" src="/stickers/${it.png}" alt="${esc(it.emoji)}">` : it.json ? `<img loading="lazy" src="/stickers/${it.png || it.tgs}" alt="${esc(it.emoji)}">` : `<div class="ph">🎭</div>`;
          return `<figure>${img}<figcaption>${esc(it.emoji)}</figcaption></figure>`;
        })
        .join("");
      sections.push(
        `<section><h3>${labels[kind]} <small>✨ متحرّك (TGS) · ${pack.items.length} ملصق · ${live ? "مرفوع لـ تيليجرام ✓" : "مازال ما انرفعش"}</small></h3><div class="g">${tiles}</div><a class="lnk" href="/stickers/index.html">🎬 شوف التحريك (Lottie)</a></section>`,
      );
      continue;
    }
    const p = (await packsFor(kind)).find(Boolean);
    if (!p) {
      sections.push(`<section><h3>${labels[kind]}</h3><p class="none">ما كاين مصدر — دوس «🚀 ارفع الملصقات» من اللوحة.</p></section>`);
      continue;
    }
    const tiles = p.stickers
      .slice(0, GALLERY_PER_SET)
      .map((s) => `<figure><img loading="lazy" src="/api/stickers/file?id=${encodeURIComponent(s.fileId)}" alt="${esc(s.emoji)}"><figcaption>${esc(s.emoji) || "🎭"}</figcaption></figure>`)
      .join("");
    sections.push(
      `<section><h3>${labels[kind]} <small>${p.video ? "🎞 فيديو" : p.animated ? "✨ متحرّك" : "🖼 ثابت"} · ${p.total}</small></h3><div class="g">${tiles}</div><a class="lnk" href="https://t.me/addstickers/${encodeURIComponent(p.name)}" target="_blank" rel="noopener">⚡️ ${esc(p.title)}</a></section>`,
    );
  }
  for (const raw of emojiSets) {
    const p = await fetchSet(raw);
    if (!p) continue;
    const tiles = p.stickers
      .slice(0, GALLERY_PER_SET)
      .map((st) => `<figure class="emo"><img loading="lazy" src="/api/stickers/file?id=${encodeURIComponent(st.fileId)}" alt="${esc(st.emoji)}"><figcaption>${esc(st.emoji) || "😀"}</figcaption></figure>`)
      .join("");
    sections.push(
      `<section><h3>😀 <b>${esc(p.title)}</b> <small>إيموجي مخصّص · ${p.total}</small></h3><div class="g">${tiles}</div><a class="lnk" href="https://t.me/addemoji/${encodeURIComponent(p.name)}" target="_blank" rel="noopener">⚡️ زيد الإيموجي</a></section>`,
    );
  }
  return `<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>🎭 ملصقات البوت</title><style>body{margin:0;background:#0b0d12;color:#e8ecf4;font:15px/1.6 system-ui,-apple-system,"Segoe UI",Tahoma,sans-serif;padding:18px}h1{font-size:20px;margin:0 0 2px}.sub{color:#8b93a7;margin:0 0 18px}section{background:#121620;border:1px solid #1e2431;border-radius:16px;padding:14px 16px;margin:0 0 14px}h3{margin:0 0 10px;font-size:16px}small{color:#8b93a7;font-weight:400}.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:10px}figure{margin:0;background:#0f131b;border:1px solid #1e2431;border-radius:12px;padding:6px;text-align:center}figure.emo{max-width:64px}figure img{width:100%;aspect-ratio:1;object-fit:contain;display:block;border-radius:8px}.ph{display:grid;place-items:center;aspect-ratio:1;font-size:26px}figcaption{font-size:12px;color:#8b93a7}.lnk{display:inline-block;margin-top:10px;color:#ffb547;text-decoration:none;font-size:13px}.none{color:#8b93a7;margin:0}</style></head><body><h1>🎭 ملصقات البوت المتحركة</h1><p class="sub">قلوب · نجوم · طاقة · احتفال · كؤوس — بلا حيوانات. مولّدة داخلياً (Lottie TGS 512×512).</p>${sections.join("")}</body></html>`;
}
