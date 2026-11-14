/**
 * 🚨 سجل الأخطاء المركزي — كل خطأ في البوت كيتسجّل هنا وكيبان في لوحة التحكم.
 *
 * الهدف: البوت ما يوقفش أبداً؛ أي استثناء (webhook، تيليغرام، قاعدة البيانات،
 * unhandledRejection...) كيوصل للمالك من خلال قسم «الأخطاء» بدل ما يضيع في سجل
 * Vercel اللي ما كيتشافش.
 */
import { getStore } from "./store";

export type ErrorEntry = {
  at: number;
  /** مصدر الخطأ: webhook / telegram / db / cron / assistant / panel / process */
  scope: string;
  message: string;
  /** أول 1200 حرف من الـ stack (بلا أسرار) */
  stack: string;
  /** تفاصيل إضافية (معرّف المستخدم، الأمر...) */
  meta: string;
  count: number;
};

const LOG_KEY = "errors:log";
const SEEN_KEY = (id: string) => `errors:seen:${id}`;
const MAX_ENTRIES = 120;

/** إخفاء أي توكن/سر يظهر في رسالة خطأ (تيليغرام كيذكّر التوكن في بعض الأخطاء) */
export function redact(text: unknown): string {
  return String(text ?? "")
    .replace(/\b\d{6,12}:[A-Za-z0-9_-]{25,}\b/g, "<bot-token>")
    .replace(/(?:postgres(?:ql)?|redis|rediss):\/\/\S+/gi, "<database-url>")
    .replace(/((?:token|secret|password|key|authorization)\s*[=:]\s*)\S+/gi, "$1<redacted>")
    .slice(0, 1200);
}

function fingerprint(scope: string, message: string): string {
  const text = `${scope}|${message}`;
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash).toString(36);
}

/**
 * نسجّل خطأ. `throttleMs` كيمنع الطوفان: نفس الخطأ كيتجمّع في عدّاد بدل 200 سطر.
 * الدالة عمرها ما كترمي استثناء — التسجيل ما خاصوش يكسر العملية الأصلية.
 */
export async function logError(
  scope: string,
  error: unknown,
  meta: Record<string, unknown> = {},
  options: { throttleMs?: number } = {},
): Promise<ErrorEntry | null> {
  try {
    const message = redact((error as Error)?.message || error || "خطأ غير معروف").slice(0, 500);
    const stack = redact((error as Error)?.stack || "").slice(0, 1200);
    const fingerprintId = fingerprint(scope, message);
    const store = getStore();
    const throttleMs = options.throttleMs ?? 60_000;
    // نفس الخطأ داخل نافذة التهدئة: ما نزيدوش سطر جديد
    const seenAt = Number(await store.get<number>(SEEN_KEY(fingerprintId)).catch(() => 0)) || 0;
    if (throttleMs > 0 && Date.now() - seenAt < throttleMs) {
      await store.incr(`errors:count:${fingerprintId}`, 1).catch(() => 0);
      return null;
    }
    await store.set(SEEN_KEY(fingerprintId), Date.now()).catch(() => undefined);
    const count = Number(await store.get<number>(`errors:count:${fingerprintId}`).catch(() => 0)) || 0;
    await store.del(`errors:count:${fingerprintId}`).catch(() => undefined);
    const entry: ErrorEntry = {
      at: Date.now(),
      scope: redact(scope).slice(0, 40),
      message,
      stack,
      meta: redact(JSON.stringify(meta)).slice(0, 600),
      count: count + 1,
    };
    await store.listPush(LOG_KEY, [JSON.stringify(entry)]);
    // سقف صلب للسجل: نحتفظو بآخر MAX_ENTRIES فقط
    const len = await store.listLen(LOG_KEY).catch(() => 0);
    if (len > MAX_ENTRIES + 40) {
      const keep = (await store.listAll(LOG_KEY, len)).slice(-MAX_ENTRIES);
      await store.delList(LOG_KEY);
      if (keep.length) await store.listPush(LOG_KEY, keep);
    }
    console.error(`[${entry.scope}] ${entry.message}`);
    return entry;
  } catch (logFailure) {
    // آخر حل: سجل السيرفر فقط
    console.error("[errors] failed to persist error", logFailure);
    return null;
  }
}

/** سجل الأخطاء الأحدث أولاً (للوحة التحكم) */
export async function readErrors(limit = 60): Promise<ErrorEntry[]> {
  const n = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit) || 60));
  const raw = await getStore().listRecent(LOG_KEY, n).catch(() => [] as string[]);
  return raw.flatMap((line) => {
    try {
      const row = JSON.parse(line) as ErrorEntry;
      return row && typeof row.message === "string" ? [row] : [];
    } catch {
      return [];
    }
  });
}

export async function clearErrors(): Promise<number> {
  const store = getStore();
  const len = await store.listLen(LOG_KEY).catch(() => 0);
  await store.delList(LOG_KEY);
  return len;
}

/**
 * 🛡️ شبكة أمان العملية: `unhandledRejection` و`uncaughtException` كيتسجّلو
 * وما كيوقفوش البوت. كيتستدعى من instrumentation.ts مرة واحدة لكل نسخة.
 */
const processGlobal = globalThis as unknown as { __ftProcessGuard?: boolean };

export function installProcessGuards(): void {
  if (processGlobal.__ftProcessGuard) return;
  processGlobal.__ftProcessGuard = true;
  process.on("unhandledRejection", (reason) => {
    void logError("process", reason, { kind: "unhandledRejection" });
  });
  process.on("uncaughtException", (error) => {
    // ما نخليوش العملية تموت: نسجّلو ونكمّلو (Vercel كيعاود يشغّل النسخة إلا تعطّلت)
    void logError("process", error, { kind: "uncaughtException" });
  });
  process.on("warning", (warning) => {
    if (warning?.name === "MaxListenersExceededWarning") return;
  });
}
