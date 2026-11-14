/**
 * 💾 emojiState.ts — حالة الإيموجي المتحرك في قاعدة البيانات فقط (Vercel ما كيحفظش الملفات).
 *
 *   emoji2:cfg   → صغير: الوضع + القدرات + رقم النسخة (كيتقرا مرة كل 30 ثانية لكل نسخة)
 *   emoji2:data  → الخريطة والباقات (كتتقرا غير إلا تبدّل رقم النسخة)
 *
 * الرسائل ما كتدير حتى نداء إضافي: كلشي من ذاكرة النسخة (cache).
 */
import { getStore } from "./store";
import type { EmojiMode } from "./emojiLayer";

export type EmojiEntry = {
  id: string;
  pack: string;
  /** متحرك (TGS/WEBM) ولا ثابت */
  anim: boolean;
  /** بدائل متحقَّق منها من باقات أخرى */
  alts?: { id: string; pack: string; anim: boolean }[];
  /** اختارو المالك بيدو من اللوحة */
  manual?: boolean;
  /** قبلو تيليجرام في رسالة اختبار حقيقية */
  tested?: boolean;
};

export type PackInfo = {
  name: string;
  title: string;
  type: "custom_emoji" | "regular";
  count: number;
  animated: number;
  verifiedAt: number;
  source: "catalog" | "panel" | "command" | "seed";
};

export type StickerRef = { fileId: string; pack: string };

export type Caps = {
  /** نص متحرك: true مقبول / false مرفوض أو مُسقَط / null ما تجرّبش */
  text: boolean | null;
  /** أيقونة زر */
  button: boolean | null;
  checkedAt: number;
  textNote: string;
  buttonNote: string;
};

export type Discovery = {
  /** موضع الدفعة الموالية (0 = بداية جديدة) */
  cursor: number;
  total: number;
  startedAt: number;
  finishedAt: number;
  running: boolean;
  lastError: string;
};

export type EmojiCfg = {
  v: number;
  mode: EmojiMode;
  caps: Caps;
  discovery: Discovery;
  updatedAt: number;
};

export type EmojiData = {
  packs: Record<string, PackInfo>;
  /** باقات مرشّحة فشل التحقق منها — مع جواب تيليجرام الحرفي */
  failed: Record<string, { error: string; at: number }>;
  /** الخريطة المعتمدة: إيموجي → أفضل ID */
  map: Record<string, EmojiEntry>;
  /** ملصقات حقيقية للخطة البديلة: إيموجي → file_id */
  stickers: Record<string, StickerRef>;
  /** باقات زادها المالك (رابط/أمر) */
  extraPacks: string[];
  /** باقات حيّدها المالك من اللوحة */
  removedPacks: string[];
  /** إيموجيات حيّدها المالك من الخريطة */
  removed: string[];
  /** اختيارات المالك اليدوية: إيموجي → ID */
  overrides: Record<string, { id: string; pack: string; anim: boolean }>;
  /** IDs رفضها تيليجرام في الاختبار (ما ترجعش للخريطة) */
  rejected: Record<string, string>;
};

const CFG_KEY = "emoji2:cfg";
const DATA_KEY = "emoji2:data";
const CFG_TTL_MS = 30_000;

export function defaultCfg(): EmojiCfg {
  return {
    v: 0,
    mode: "animated",
    caps: { text: null, button: null, checkedAt: 0, textNote: "", buttonNote: "" },
    discovery: { cursor: 0, total: 0, startedAt: 0, finishedAt: 0, running: false, lastError: "" },
    updatedAt: 0,
  };
}

export function defaultData(): EmojiData {
  return { packs: {}, failed: {}, map: {}, stickers: {}, extraPacks: [], removedPacks: [], removed: [], overrides: {}, rejected: {} };
}

function normCfg(raw: Partial<EmojiCfg> | null): EmojiCfg {
  const base = defaultCfg();
  if (!raw || typeof raw !== "object") return base;
  const mode = raw.mode === "stickers" || raw.mode === "plain" ? raw.mode : "animated";
  return {
    v: Number(raw.v) || 0,
    mode,
    caps: { ...base.caps, ...(raw.caps || {}) },
    discovery: { ...base.discovery, ...(raw.discovery || {}) },
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

function normData(raw: Partial<EmojiData> | null): EmojiData {
  const base = defaultData();
  if (!raw || typeof raw !== "object") return base;
  return {
    packs: raw.packs || {},
    failed: raw.failed || {},
    map: raw.map || {},
    stickers: raw.stickers || {},
    extraPacks: Array.isArray(raw.extraPacks) ? raw.extraPacks : [],
    removedPacks: Array.isArray(raw.removedPacks) ? raw.removedPacks : [],
    removed: Array.isArray(raw.removed) ? raw.removed : [],
    overrides: raw.overrides || {},
    rejected: raw.rejected || {},
  };
}

export type Runtime = {
  cfg: EmojiCfg;
  map: Record<string, EmojiEntry>;
  stickers: Record<string, StickerRef>;
  /** إطفاء مؤقت في الذاكرة (قاطع أمان) */
  textOffUntil: number;
  iconsOffUntil: number;
  textDrops: number;
  iconDrops: number;
  failures: number;
};

type Cache = { rt: Runtime; at: number; dataV: number; loading: Promise<Runtime> | null };
const g = globalThis as unknown as { __ftEmojiRt?: Cache };

function cache(): Cache {
  g.__ftEmojiRt ||= {
    rt: { cfg: defaultCfg(), map: {}, stickers: {}, textOffUntil: 0, iconsOffUntil: 0, textDrops: 0, iconDrops: 0, failures: 0 },
    at: 0,
    dataV: -1,
    loading: null,
  };
  return g.__ftEmojiRt;
}

async function reload(c: Cache): Promise<Runtime> {
  try {
    const store = getStore();
    const cfg = normCfg(await store.get<EmojiCfg>(CFG_KEY));
    if (cfg.v !== c.dataV) {
      const data = normData(await store.get<EmojiData>(DATA_KEY));
      c.rt.map = data.map;
      c.rt.stickers = data.stickers;
      c.dataV = cfg.v;
    }
    c.rt.cfg = cfg;
  } catch (error) {
    console.error("[emoji] تعذّر تحميل الحالة — نكمل بآخر نسخة في الذاكرة", error);
  }
  c.at = Date.now();
  return c.rt;
}

/** ⚡ الحالة من الذاكرة (قراءة قاعدة البيانات مرة كل 30 ثانية لكل نسخة، ماشي لكل رسالة) */
export async function getRuntime(): Promise<Runtime> {
  const c = cache();
  if (Date.now() - c.at < CFG_TTL_MS && c.dataV >= 0) return c.rt;
  if (!c.loading) c.loading = reload(c).finally(() => (c.loading = null));
  // أول تحميل: ننتظرو. من بعد: نخدمو بالنسخة القديمة والتحديث في الخلفية.
  if (c.dataV < 0) return c.loading;
  return c.rt;
}

/** نفرضو إعادة التحميل (بعد تعديل من اللوحة/الاكتشاف) */
export function invalidateRuntime(): void {
  const c = cache();
  c.at = 0;
  c.dataV = -1;
}

export async function loadCfg(): Promise<EmojiCfg> {
  return normCfg(await getStore().get<EmojiCfg>(CFG_KEY));
}

export async function loadData(): Promise<EmojiData> {
  return normData(await getStore().get<EmojiData>(DATA_KEY));
}

/** نحفظو الإعداد (ونزيدو رقم النسخة إلا تبدّلات الخريطة) */
export async function saveCfg(cfg: EmojiCfg, bump = false): Promise<EmojiCfg> {
  const next = { ...cfg, v: bump ? Math.max(cfg.v, 0) + 1 : cfg.v, updatedAt: Date.now() };
  await getStore().set(CFG_KEY, next);
  invalidateRuntime();
  return next;
}

export async function saveData(data: EmojiData): Promise<void> {
  await getStore().set(DATA_KEY, data);
}

/** تعديل ذرّي بسيط: قراءة ← تعديل ← حفظ ← نسخة جديدة */
export async function mutate(fn: (data: EmojiData, cfg: EmojiCfg) => void | Promise<void>): Promise<{ data: EmojiData; cfg: EmojiCfg }> {
  const [data, cfg] = await Promise.all([loadData(), loadCfg()]);
  await fn(data, cfg);
  await saveData(data);
  const saved = await saveCfg(cfg, true);
  return { data, cfg: saved };
}

/** نحدّثو القدرات فقط (من الكشف التلقائي أثناء الإرسال) */
export async function saveCaps(patch: Partial<Caps>): Promise<void> {
  try {
    const cfg = await loadCfg();
    cfg.caps = { ...cfg.caps, ...patch, checkedAt: Date.now() };
    await saveCfg(cfg, false);
  } catch (error) {
    console.error("[emoji] تعذّر حفظ القدرات", error);
  }
}
