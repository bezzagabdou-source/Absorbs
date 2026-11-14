/**
 * 🔒 أقفال موقّتة (leases) على مستوى المخزن — كتخدم مع Redis وكـ Postgres وكـ الذاكرة.
 *
 * علاش: كل عمليات الفلوس (النقاط، الطلبات، المتجر، مخزون الجوائز) مقروءة-معدّلة-
 * مكتوبة (read-modify-write). على Vercel كاينين نسخ متعددة في نفس الوقت، فبلا قفل
 * جوج طلبات كيقراو نفس الرصيد وكيكتبو فوق بعضهم → نقاط كتضيع ولا كتتضاعف.
 *
 * القفل:
 *   - `withLock(scope, fn)` كياخد قفل بـ TTL، كينفّذ العملية، وكيطلقه (في finally).
 *   - إلا كان القفل محجوز، كيستنّى ويعاود بشوية (backoff) حتى `waitMs`، ومن بعد
 *     كيرمي `LockBusyError` باش المتصل يعطي رسالة واضحة للمستخدم بدل ما يكمل بلا أمان.
 *
 * ملاحظة: هادشي ماشي معاملة كاملة (لا rollback)، لكنه كيمنع التداخل بين النسخ —
 * وهو السبب الحقيقي لضياع النقاط في بيئة serverless.
 */
import { getStore } from "./store";
import { logError } from "./errors";

export class LockBusyError extends Error {
  constructor(public readonly scope: string) {
    super("العملية مازالها كتمشي على نفس الحساب — عاود من بعد لحظة");
    this.name = "LockBusyError";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function token(): string {
  return `${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
}

/** قفل خام: كيرجع token إلا توفّق، ولا null */
export async function acquireLock(scope: string, ttlMs = 15_000): Promise<string | null> {
  const owner = token();
  const ok = await getStore().acquireLease(`lock:${scope}`, owner, ttlMs);
  return ok ? owner : null;
}

export async function releaseLock(scope: string, owner: string): Promise<void> {
  await getStore().releaseLease(`lock:${scope}`, owner).catch(() => undefined);
}

/**
 * ينفّذ `work` تحت قفل `scope`.
 * @param scope اسم القفل (مثال: `points:add:<userId>`)
 * @param ttlMs مدة صلاحية القفل — خاصها تكون أكبر من مدة العملية الطبيعية
 * @param waitMs شحال نستنّاو قبل ما نستسلمو
 */
export async function withLock<T>(
  scope: string,
  work: () => Promise<T>,
  { ttlMs = 15_000, waitMs = 3_000 }: { ttlMs?: number; waitMs?: number } = {},
): Promise<T> {
  const started = Date.now();
  let owner = await acquireLock(scope, ttlMs);
  let delay = 60;
  while (!owner) {
    if (Date.now() - started >= waitMs) {
      await logError("lock", new LockBusyError(scope), { scope }).catch(() => undefined);
      throw new LockBusyError(scope);
    }
    await sleep(delay);
    delay = Math.min(400, Math.round(delay * 1.7));
    owner = await acquireLock(scope, ttlMs);
  }
  try {
    return await work();
  } finally {
    await releaseLock(scope, owner);
  }
}

/** نفس `withLock` لكن بلا استثناء: كيرجع `fallback` إلا كان القفل محجوز. */
export async function tryWithLock<T>(
  scope: string,
  work: () => Promise<T>,
  fallback: T,
  options: { ttlMs?: number; waitMs?: number } = {},
): Promise<T> {
  try {
    return await withLock(scope, work, options);
  } catch (error) {
    if (error instanceof LockBusyError) return fallback;
    throw error;
  }
}
