import { getStore } from "./store";
import { DEFAULT_SETTINGS, OWNER_USERNAME, PINNED_CHANNELS, WELCOME_TEXT, type Settings } from "./types";

/** 🔐 كنضيفو القنوات المثبّتة (بلا تكرار) — ما تسقطش من البوابة */
export function withPinnedChannels(list: unknown, locked: string[] = []): string[] {
  const base = normalizeChannels(list);
  for (const pin of [...normalizeChannels(PINNED_CHANNELS), ...locked]) if (!base.includes(pin)) base.unshift(pin);
  return base;
}

/**
 * 🔒 القنوات المقفولة: اتحاد (الكود ∪ سجل system:locked-channels ف قاعدة البيانات).
 * السجل كيتكتب من الكود فقط ويكبر ولا يصغر؛ المفاتيح `system:*` محمية من أدوات المساعد وأي أداة بيانات.
 * يعني حتى إلا تحيّدات القناة من الكود، كتبقى مفروضة من قاعدة البيانات.
 */
const LOCK_KEY = "system:locked-channels";
let lockMemo: { at: number; list: string[] } | null = null;
export async function lockedChannels(): Promise<string[]> {
  const code = normalizeChannels(PINNED_CHANNELS);
  if (lockMemo && Date.now() - lockMemo.at < 60_000) return [...new Set([...lockMemo.list, ...code])];
  let stored: string[] = [];
  try {
    const record = await getStore().get<{ channels?: unknown }>(LOCK_KEY);
    stored = normalizeChannels(record?.channels);
  } catch {
    /* التخزين غير متاح مؤقتاً: الكود وحده كافي */
  }
  const merged = [...new Set([...stored, ...code])];
  if (merged.length > stored.length) {
    try {
      await getStore().set(LOCK_KEY, { channels: merged, at: Date.now() });
    } catch {
      /* نعاودو ف الطلب الجاي */
    }
  }
  lockMemo = { at: Date.now(), list: merged };
  return merged;
}

/** تطبيع قائمة القنوات: نص أو مصفوفة → مصفوفة @usernames فريدة */
export function normalizeChannels(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(/[\n,]+/)
        .map((x) => x.trim());
  const out: string[] = [];
  for (const item of raw) {
    const value = String(item || "").trim();
    if (!value) continue;
    const normalized = value.startsWith("https://t.me/")
      ? `@${value.replace(/^https:\/\/t\.me\//, "").replace(/\/.*$/, "")}`
      : value;
    if (!out.includes(normalized)) out.push(normalized);
  }
  return out;
}

const SETTINGS_KEY = "settings";
/** إصدار بوابة الاشتراك الإجباري (2 = القنوات المتعددة) */
const GATE_VERSION = 2;
const SECRET_KEY = "system:secret";

/** هل النص هو ترحيب قديم جداً لازم يتبدّل؟ (نحافظ على ترحيب الصورة) */
function isOldLongWelcome(text: string): boolean {
  if (text.includes("{points}")) return false; // ترحيب النسخة القديمة (الصورة) — نحافظ عليه
  return text.length > 90 || /هنا تربح|اختر من الأزرار/.test(text);
}

/** ⚡ كاش قصير (3 ثواني) للإعدادات: كانت كل رسالة كتقراها 6-10 مرات من قاعدة البيانات */
const SETTINGS_TTL_MS = 3_000;
let settingsCache: { at: number; value: Settings } | null = null;

export async function getSettings(): Promise<Settings> {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return { ...settingsCache.value };
  const value = await loadSettings();
  settingsCache = { at: Date.now(), value };
  return { ...value };
}

async function loadSettings(): Promise<Settings> {
  const store = getStore();
  const locked = await lockedChannels();
  const saved = (await store.get<Partial<Settings>>(SETTINGS_KEY)) || {};
  const envToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
  const savedWelcome = (saved.welcomeText || "").trim();
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
    lockedChannels: locked,
    botToken: saved.botToken || envToken,
    ownerUsername: (saved.ownerUsername || OWNER_USERNAME).replace(/^@/, ""),
    supportUsername: (saved.supportUsername || saved.ownerUsername || OWNER_USERNAME).replace(/^@/, ""),
    welcomeText:
      !savedWelcome || savedWelcome === "مرحبا بكم في بوت مسابقات FT" || isOldLongWelcome(savedWelcome)
        ? WELCOME_TEXT
        : savedWelcome,
    requiredChannels: withPinnedChannels(
      (() => {
        const list = normalizeChannels(saved.requiredChannels);
        if (list.length) return list;
        const legacy = normalizeChannels(saved.channelChat);
        if (legacy.length) return legacy;
        return DEFAULT_SETTINGS.requiredChannels;
      })(),
      locked,
    ),
    // 🔒 نسخة الاشتراك الإجباري: البوابة شغّالة افتراضياً (كيما كانت).
    // تقدر تطفيها من اللوحة (تتخزّن ف gateOn).
    requireJoin:
      PINNED_CHANNELS.length && forceGateOn()
        ? true // 🔒 كاينة قناة مثبّتة → البوابة شغّالة على كل واحد (جديد ولا قديم)
        : saved.gateOn === undefined
          ? true
          : Boolean(saved.gateOn),
    gateV: GATE_VERSION,
    groupTarget: Math.max(1, Number(saved.groupTarget) || DEFAULT_SETTINGS.groupTarget),
    aiEnabled: saved.aiEnabled === undefined ? DEFAULT_SETTINGS.aiEnabled : Boolean(saved.aiEnabled),
    aiModel: (saved.aiModel || "").trim(),
    webhookSecret:
      saved.webhookSecret ||
      process.env.TELEGRAM_WEBHOOK_SECRET ||
      process.env.WEBHOOK_SECRET ||
      "",
  };
  return settings;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await loadSettings();
  const next: Settings = { ...current, ...patch, gateV: GATE_VERSION };
  // 🔐 القنوات المثبّتة ما تسقطش حتى إلا تحيّدتا من اللوحة
  const locked = await lockedChannels();
  next.lockedChannels = locked;
  next.requiredChannels = withPinnedChannels(patch.requiredChannels !== undefined ? patch.requiredChannels : next.requiredChannels, locked);
  // أي تعديل صريح على requireJoin = قرار المالك → نثبّتوه
  if (patch.requireJoin !== undefined) next.gateOn = Boolean(patch.requireJoin);
  // 🔐 والبوابة كتبقى شغّالة على الكل دام كاينة قناة مثبّتة (المالك يطفيها غير بـ GATE_OFF=1)
  if (PINNED_CHANNELS.length && forceGateOn()) {
    next.gateOn = true;
    next.requireJoin = true;
  }
  await getStore().set(SETTINGS_KEY, next);
  settingsCache = null; // 🔄 التعديل يظهر فوراً
  return next;
}

/** إلا كان env GATE_OFF=1 → المالك طفا البوابة بيده (واحيدة اللي تقدر) */
export function forceGateOn(): boolean {
  return String(process.env.GATE_OFF || "") !== "1";
}

/** يوزر المالك بصيغة @handle */
export function ownerHandle(settings: Settings): string {
  return `@${(settings.ownerUsername || OWNER_USERNAME).replace(/^@/, "")}`;
}

/** سر ثابت (للجلسات) — من env أو يُنشأ ويُخزَّن مرة واحدة */
export async function getAppSecret(): Promise<string> {
  if (process.env.ADMIN_SECRET && process.env.ADMIN_SECRET.length >= 16) {
    return process.env.ADMIN_SECRET;
  }
  const store = getStore();
  let secret = await store.get<string>(SECRET_KEY);
  if (!secret) {
    secret = crypto.randomUUID() + crypto.randomUUID();
    await store.set(SECRET_KEY, secret);
  }
  return secret;
}

export async function ensureWebhookSecret(): Promise<string> {
  const settings = await getSettings();
  if (settings.webhookSecret) return settings.webhookSecret;
  const secret = `wh_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  await saveSettings({ webhookSecret: secret });
  return secret;
}
