/**
 * 🔁 إعادة المحاولة مع backoff — طبقة واحدة لكل نداء خارجي (تيليغرام، قاعدة البيانات، HTTP).
 *
 * القواعد:
 *  • غير نعاودو أبداً خطأ «دائم» (400/401/403/404) — إعادة المحاولة كتزيد الضرر.
 *  • نعاودو غير الأخطاء العابرة: شبكة، timeout، 429، 5xx، استنفاد اتصالات القاعدة.
 *  • backoff أُسّي مع jitter باش ما يتزامنوش الطلبات.
 *  • سقف صلب للمدة (deadline) باش الويب هوك ما يمسكش الدالة أكثر من اللازم.
 *  • `onRetry` كيتسجّل في سجل الأخطاء باش المالك يشوف كل رجوع.
 */

export type RetryOptions = {
  /** عدد المحاولات الكلي (1 = بلا إعادة) */
  attempts?: number;
  /** تأخير البداية بالميلي ثانية */
  baseMs?: number;
  /** سقف التأخير */
  maxDelayMs?: number;
  /** مهلة كل محاولة (AbortSignal/timeout) */
  timeoutMs?: number;
  /** سقف المدة الكلية من بداية الدالة */
  budgetMs?: number;
  /** هل الخطأ عابر؟ افتراضياً `isTransientError` */
  retryable?: (error: unknown) => boolean;
  /** ما يتنفّذ قبل كل إعادة (تسجيل، تأجيل من تيليغرام...) */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void | Promise<void>;
  /** تأخير مطلوب من الخدمة (تيليغرام retry_after) — يتغلّب على backoff */
  retryAfterMs?: (error: unknown) => number | null;
  label?: string;
};

const PERMANENT = /\b(?:400|401|403|404|409|422)\b|unauthorized|forbidden|not found|bad request|chat not found|not enough rights|invalid/i;
const TRANSIENT = /ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EPIPE|EAI_AGAIN|socket hang up|timeout|timed out|network|fetch failed|too many requests|429|502|503|504|connection terminated|remaining connection slots|deadlock|serialization failure|could not connect|Connection pool|client has encountered a connection error/i;

export function isTransientError(error: unknown): boolean {
  const detail = [
    (error as { code?: unknown })?.code,
    (error as { name?: unknown })?.name,
    (error as { message?: unknown })?.message,
  ]
    .filter(Boolean)
    .join(" ");
  if (!detail) return false;
  if (/AbortError|TimeoutError|Timeout/i.test(String((error as { name?: string })?.name || ""))) return true;
  if (TRANSIENT.test(detail)) return true;
  if (PERMANENT.test(detail)) return false;
  // Unknown errors are treated as permanent: retrying blind can duplicate writes.
  return false;
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** تأخير أُسّي + jitter، مقيّد بسقف */
export function backoffDelay(attempt: number, baseMs = 250, maxDelayMs = 4000): number {
  const raw = Math.min(maxDelayMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.random() * Math.min(200, raw * 0.25);
  return Math.round(raw + jitter);
}

export async function retry<T>(task: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const started = Date.now();
  const budget = Math.max(0, options.budgetMs ?? 30_000);
  const retryable = options.retryable ?? isTransientError;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1 && Date.now() - started > budget) break;
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      const exhausted = attempt >= attempts;
      if (exhausted || !retryable(error)) throw error;
      const remaining = budget - (Date.now() - started);
      if (remaining <= 150) throw error;
      const hinted = options.retryAfterMs ? options.retryAfterMs(error) : null;
      const delay = Math.min(remaining - 50, hinted && hinted > 0 ? hinted : backoffDelay(attempt, options.baseMs, options.maxDelayMs));
      try {
        await options.onRetry?.(error, attempt, delay);
      } catch {
        /* التسجيل ما يفشّلش العملية */
      }
      await sleep(delay);
    }
  }
  throw lastError;
}

/** مهلة صلبة لنداء واحد: كتحوّل الوعود لـ AbortSignal قابل للإلغاء */
export async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, ms: number, label = "operation"): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.name = "TimeoutError";
      reject(error);
    }, Math.max(1, ms));
  });
  try {
    return await Promise.race([task(controller.signal), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
