import { getStore } from "./store";
import { DEFAULT_SETTINGS, OWNER_USERNAME, WELCOME_TEXT, type Settings } from "./types";

const SETTINGS_KEY = "settings";
const SECRET_KEY = "system:secret";

/** هل النص هو الترحيب الطويل القديم؟ (نهاجر منه إلى النص القصير) */
function isOldLongWelcome(text: string): boolean {
  return text.length > 90 || /هنا تربح|اختر من الأزرار|أهلاً \{name\}/.test(text);
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
    welcomeText: !savedWelcome || isOldLongWelcome(savedWelcome) ? WELCOME_TEXT : savedWelcome,
    groupTarget: Math.max(1, Number(saved.groupTarget) || DEFAULT_SETTINGS.groupTarget),
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
  const next: Settings = { ...current, ...patch };
  await getStore().set(SETTINGS_KEY, next);
  return next;
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
