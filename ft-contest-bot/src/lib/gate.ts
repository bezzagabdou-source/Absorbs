/**
 * 🔒 الاشتراك الإجباري — الشرط الثابت الوحيد في البوت.
 *
 * القناة مثبّتة في الكود (`PINNED_CHANNELS`) وما كتقدرش تتحيّد ولا تتعطّل ولا
 * تتبدّل من أي مكان:
 *   • البوت: `enforcedChannels()` كتضيف القناة لكل قائمة، و`requireJoin` مقفول على true.
 *   • اللوحة: `settings_save` كيرفض أي محاولة تحييدها، والمفتاح ما كاينش في واجهات /api/panel.
 *   • المساعد الذكي (الاثنين: داخل اللوحة وداخل البوت): أداة `set_gate` مقيّدة + قاعدة
 *     صريحة في system prompt + حارس في طبقة التنفيذ.
 *
 * هذا الملف هو المصدر الوحيد للحقيقة. أي كود كيقرا القناة خاصو يدوز من هنا.
 */
import { PINNED_CHANNELS } from "./types";

/** القناة الإجبارية (يمكن تثبيتها في البيئة، وما كتقدرش تتغيّر من اللوحة) */
export const MANDATORY_CHANNEL_URL = "https://t.me/mxabdou";
export const MANDATORY_CHANNEL = "@mxabdou";

export type GatePolicy = { required: true; channels: string[]; url: string };

/** تطبيع @username أو https://t.me/x → @username */
export function normalizeChannel(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^https?:\/\/(?:t|telegram)\.me\//i.test(raw)) {
    const name = raw.replace(/^https?:\/\/(?:t|telegram)\.me\//i, "").replace(/[/?#].*$/, "");
    return name ? `@${name}` : "";
  }
  if (raw.startsWith("@")) return raw;
  if (/^-?\d{5,20}$/.test(raw)) return raw;
  return `@${raw}`;
}

function envPinned(): string[] {
  const raw = String(process.env.MANDATORY_CHANNELS || process.env.PINNED_CHANNELS || "").trim();
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map(normalizeChannel)
    .filter(Boolean);
}

/**
 * القنوات الإجبارية الفعلية: البيئة (إن وُجدت) + الثابتة في الكود، بلا تكرار.
 * عمرها ما كترجع قائمة فارغة.
 */
export function mandatoryChannels(): string[] {
  const out: string[] = [];
  for (const channel of [...envPinned(), ...PINNED_CHANNELS.map(normalizeChannel), MANDATORY_CHANNEL]) {
    if (channel && !out.includes(channel)) out.push(channel);
  }
  return out;
}

/** هل هذه القناة محمية؟ (ما كتتحيّدش من أي قائمة) */
export function isProtectedChannel(value: unknown): boolean {
  const channel = normalizeChannel(value).toLowerCase();
  return Boolean(channel) && mandatoryChannels().some((item) => item.toLowerCase() === channel);
}

/**
 * طبق السياسة على مدخلات اللوحة/المساعد:
 *  • كاملة (replace): كتضيف المحمية بالقوة.
 *  • محذوفة (remove): كتتجاهل المحمية وترجع تقرير باللي تحيّد.
 *  • تعطيل (gate off): مرفوض نهائياً.
 */
export function enforceGatePolicy(input: {
  requiredChannels?: unknown;
  remove?: unknown;
  requireJoin?: unknown;
}): {
  channels: string[];
  blocked: string[];
  ignoredRemove: string[];
  requireJoin: true;
  tampered: boolean;
} {
  const mandatory = mandatoryChannels();
  let list: string[] = [];
  if (input.requiredChannels !== undefined) {
    const raw = Array.isArray(input.requiredChannels)
      ? input.requiredChannels
      : String(input.requiredChannels ?? "").split(/[\n,;]+/);
    list = raw.map(normalizeChannel).filter(Boolean);
  }
  const blocked: string[] = [];
  if (input.remove !== undefined) {
    const raw = Array.isArray(input.remove) ? input.remove : String(input.remove ?? "").split(/[\n,;]+/);
    for (const item of raw.map(normalizeChannel).filter(Boolean)) {
      if (isProtectedChannel(item)) blocked.push(item);
    }
  }
  // المحمية كتضاف دايماً في الأول، وما كتتحيّدش حتى لو طلب المستخدم
  const ignoredRemove = blocked.length ? blocked : [];
  const merged: string[] = [];
  for (const channel of [...mandatory, ...list]) {
    if (!merged.some((item) => item.toLowerCase() === channel.toLowerCase())) merged.push(channel);
  }
  const tampered =
    blocked.length > 0 ||
    input.requireJoin === false ||
    (Array.isArray(input.requiredChannels) &&
      !mandatory.every((channel) =>
        (input.requiredChannels as unknown[]).some((item) => normalizeChannel(item).toLowerCase() === channel.toLowerCase()),
      ));

  return { channels: merged, blocked, ignoredRemove, requireJoin: true, tampered };
}

/** ملخص للقراءة فقط (للعرض في اللوحة والتشخيص) */
export function mandatoryGate(): GatePolicy {
  return { required: true, channels: mandatoryChannels(), url: MANDATORY_CHANNEL_URL };
}

/** رسالة رفض واضحة تُعيدها اللوحة/المساعد */
export const GATE_LOCK_MESSAGE =
  "🔒 الاشتراك الإجباري في القناة " +
  MANDATORY_CHANNEL_URL +
  " شرط ثابت في البوت: ما يمكن حذفه ولا تعطيله ولا تغييره من لوحة التحكم ولا من المساعد.";
