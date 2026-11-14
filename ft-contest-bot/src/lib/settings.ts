import { getStore } from "./store";
import { DEFAULT_SETTINGS, OWNER_USERNAME, PINNED_CHANNELS, WELCOME_TEXT, type Settings } from "./types";

/** 🔐 كنضيفو القنوات المثبّتة (بلا تكرار) — ما تسقطش من البوابة */
export function withPinnedChannels(list: unknown): string[] {
  const base = normalizeChannels(list);
  for (const pin of normalizeChannels(PINNED_CHANNELS)) if (!base.includes(pin)) base.unshift(pin);
  return base;
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

export async function getSettings(): Promise<Settings> {
  const store = getStore();
  const saved = (await store.get<Partial<Settings>>(SETTINGS_KEY)) || {};
  const envToken = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
  const savedWelcome = (saved.welcomeText || "").trim();
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    ...saved,
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
  const current = await getSettings();
  const next: Settings = { ...current, ...patch, gateV: GATE_VERSION };
  // 🔐 القنوات المثبّتة ما تسقطش حتى إلا تحيّدتا من اللوحة
  if (patch.requiredChannels !== undefined) next.requiredChannels = withPinnedChannels(patch.requiredChannels);
  // أي تعديل صريح على requireJoin = قرار المالك → نثبّتوه
  if (patch.requireJoin !== undefined) next.gateOn = Boolean(patch.requireJoin);
  // 🔐 والبوابة كتبقى شغّالة على الكل دام كاينة قناة مثبّتة (المالك يطفيها غير بـ GATE_OFF=1)
  if (PINNED_CHANNELS.length && forceGateOn()) {
    next.gateOn = true;
    next.requireJoin = true;
  }
  await getStore().set(SETTINGS_KEY, next);
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
