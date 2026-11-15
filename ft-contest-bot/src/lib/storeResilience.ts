/**
 * 🛟 طبقة صمود فوق المخزن: البوت ما كيتوقّفش أبداً حتى إلا طاحت قاعدة البيانات.
 *
 * القصة الحقيقية: Neon رجّع «exceeded the quota»، ومن داك الوقت كل قراءة من
 * المخزن كانت كترمي استثناء. `getSettings()` كتقرا من المخزن → كل تحديث من
 * تيليغرام كيطيح → البوت «ميّت» من منظور المستعمل، واللوحة كترجع خطأ.
 *
 * الحل: كل عملية كتدوز من هنا. إلا فشل المخزن الأساسي:
 *   • القراءة → كنقراو من ذاكرة محلية (المخزن كيبقى خدّام بالقيم الأخيرة).
 *   • الكتابة → كتترمي في ذاكرة مؤقتة (outbox) وكتّعاود تتطبّق أوتوماتيكياً أول
 *     مرة يرجع المخزن (flushOutbox)، فما كتضيعش الكتابة بلا رجعة.
 *   • كل فشل كيتسجّل مرة واحدة (بلا غرق السجل) وكيبان في /api/health.
 *
 * ⚠️ الذاكرة ماشي دائمة على Vercel — هي شبكة أمان، ماشي بديل على قاعدة بيانات.
 *    لهذا كنسجّلو `degraded: true` باش المالك يعرف بلي خاصو يصلّح القاعدة.
 */
import { logError } from "./errors";
import type { LedgerEntry, Store, ZItem } from "./store";

type Fallback = {
  kv: Map<string, unknown>;
  counters: Map<string, number>;
  sets: Map<string, Set<string>>;
  zsets: Map<string, Map<string, number>>;
  lists: Map<string, string[]>;
  leases: Map<string, { token: string; exp: number }>;
};

const globalForFallback = globalThis as unknown as {
  __ftBreakerUntil?: number; // ⚡ القاطع: إلا طاحت القاعدة، ما نعاودوهاش فكل نداء
  __ftBreakerStrikes?: number;
  __ftFallback?: Fallback;
  __ftOutbox?: OutboxItem[];
  __ftDegradedSince?: number;
  __ftLastStoreError?: { at: number; message: string };
  __ftHealthyAt?: number;
  __ftDurable?: Store | null;
  __ftJournalDirty?: boolean;
  __ftFlushing?: Promise<FlushResult> | null;
  __ftLastFlush?: FlushResult & { at: number };
  __ftFallbackError?: { at: number; message: string };
};

type OutboxItem = { id: string; op: keyof Store; args: unknown[]; at: number };

function mem(): Fallback {
  globalForFallback.__ftFallback ||= {
    kv: new Map(),
    counters: new Map(),
    sets: new Map(),
    zsets: new Map(),
    lists: new Map(),
    leases: new Map(),
  };
  return globalForFallback.__ftFallback;
}

function outbox(): OutboxItem[] {
  globalForFallback.__ftOutbox ||= [];
  return globalForFallback.__ftOutbox;
}

/** عمليات الكتابة (كتتراكم في outbox وقت العطل) */
const WRITE_OPS = new Set<keyof Store>([
  "set",
  "del",
  "incr",
  "sAdd",
  "sDel",
  "zIncr",
  "listPush",
  "listPop",
  "delList",
  "setIfAbsent",
  "acquireLease",
  "releaseLease",
  "appendLedger",
]);

/** عمليات القراءة (كتنزل على الذاكرة مباشرة وقت العطل) */
async function memoryFallback<T>(op: keyof Store, args: unknown[]): Promise<T> {
  const m = mem();
  const key = String(args[0] ?? "");
  switch (op) {
    case "get":
      return (m.kv.has(key) ? m.kv.get(key) : m.counters.get(key) ?? null) as T;
    case "getMany": {
      const keys = (args[0] as string[]) || [];
      return keys.map((k) => (m.kv.has(k) ? m.kv.get(k) : m.counters.get(k) ?? null)) as T;
    }
    case "set":
      m.kv.set(key, args[1]);
      m.counters.delete(key);
      return undefined as T;
    case "del":
      m.kv.delete(key);
      m.counters.delete(key);
      m.sets.delete(key);
      m.zsets.delete(key);
      m.lists.delete(key);
      return undefined as T;
    case "incr": {
      const by = Number(args[1] ?? 1);
      const prev = Number(m.counters.get(key) ?? 0) + by;
      m.counters.set(key, prev);
      m.kv.delete(key);
      return prev as T;
    }
    case "sAdd": {
      const set = m.sets.get(key) || new Set<string>();
      const member = String(args[1]);
      if (set.has(member)) return false as T;
      set.add(member);
      m.sets.set(key, set);
      return true as T;
    }
    case "sHas": {
      const set = m.sets.get(key);
      return Boolean(set?.has(String(args[1]))) as T;
    }
    case "sCard":
      return (m.sets.get(key)?.size ?? 0) as T;
    case "sDel":
      m.sets.get(key)?.delete(String(args[1]));
      return undefined as T;
    case "sMembers":
      return [...(m.sets.get(key) || [])] as T;
    case "zIncr": {
      const z = m.zsets.get(key) || new Map<string, number>();
      const member = String(args[1]);
      const next = (z.get(member) || 0) + Number(args[2] ?? 1);
      z.set(member, next);
      m.zsets.set(key, z);
      return next as T;
    }
    case "zScore":
      return (m.zsets.get(key)?.get(String(args[1])) ?? 0) as T;
    case "zTop": {
      const z = m.zsets.get(key) || new Map<string, number>();
      const limit = Number(args[1] ?? 10);
      return [...z.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([member, score]) => ({ member, score })) as T;
    }
    case "zCount":
      return (m.zsets.get(key)?.size ?? 0) as T;
    case "listPush": {
      const list = m.lists.get(key) || [];
      list.push(...((args[1] as string[]) || []));
      m.lists.set(key, list);
      return list.length as T;
    }
    case "listPop": {
      const list = m.lists.get(key) || [];
      const value = list.shift() ?? null;
      m.lists.set(key, list);
      return value as T;
    }
    case "listLen":
      return (m.lists.get(key)?.length ?? 0) as T;
    case "listAll":
      return ((m.lists.get(key) || []).slice(0, Number(args[1] ?? 1000))) as T;
    case "listRecent": {
      const limit = Math.max(1, Number(args[1] ?? 1000));
      return ((m.lists.get(key) || []).slice(-limit).reverse()) as T;
    }
    case "delList":
      m.lists.delete(key);
      return undefined as T;
    case "setIfAbsent": {
      if (m.kv.has(key)) return false as T;
      m.kv.set(key, args[1]);
      return true as T;
    }
    case "acquireLease": {
      const token = String(args[1]);
      const ttl = Number(args[2] ?? 30_000);
      const current = m.leases.get(key);
      if (current && current.exp > Date.now() && current.token !== token) return false as T;
      m.leases.set(key, { token, exp: Date.now() + Math.max(1000, ttl) });
      return true as T;
    }
    case "releaseLease": {
      const current = m.leases.get(key);
      if (current && current.token === String(args[1])) m.leases.delete(key);
      return undefined as T;
    }
    case "appendLedger": {
      const list = m.lists.get("ledger:log") || [];
      list.unshift(JSON.stringify(args[0] as LedgerEntry));
      if (list.length > 5000) list.length = 5000;
      m.lists.set("ledger:log", list);
      return undefined as T;
    }
    case "readLedger": {
      const limit = Number(args[0] ?? 200);
      const userId = args[1] ? String(args[1]) : "";
      return (m.lists.get("ledger:log") || [])
        .flatMap((line) => {
          try {
            const row = JSON.parse(line) as LedgerEntry;
            return row && typeof row.userId === "string" ? [row] : [];
          } catch {
            return [];
          }
        })
        .filter((row) => !userId || row.userId === userId)
        .slice(0, limit) as T;
    }
    default:
      return undefined as T;
  }
}

/** نسجّل العطل مرة وحدة كل 30 ثانية (ما نغرقوش السجل) */
function noteFailure(op: keyof Store, error: unknown) {
  const now = Date.now();
  const last = globalForFallback.__ftLastStoreError;
  globalForFallback.__ftDegradedSince ||= now;
  const message = String((error as Error)?.message || error).slice(0, 300);
  globalForFallback.__ftLastStoreError = { at: now, message };
  if (!last || now - last.at > 30_000) {
    void logError("store", error, { kind: `fallback:${String(op)}` }, { throttleMs: 30_000 }).catch(() => undefined);
  }
}

function noteSuccess() {
  globalForFallback.__ftHealthyAt = Date.now();
  globalForFallback.__ftDegradedSince = undefined;
}

/**
 * ⚡ قاطع دائرة: أول عطل كيوقف المحاولات لمدة قصيرة، بعدها محاولة استكشاف
 * وحدة. بلا هادشي كل رسالة كتسنّى مهلة Postgres قبل ما ترجع للاحتياط.
 */
const BREAKER_MS = Number(process.env.STORE_BREAKER_MS) || 30_000;

function breakerOpen(): boolean {
  const until = globalForFallback.__ftBreakerUntil || 0;
  return Date.now() < until;
}

function tripBreaker() {
  globalForFallback.__ftBreakerUntil = Date.now() + BREAKER_MS;
}

function resetBreaker() {
  globalForFallback.__ftBreakerUntil = 0;
  globalForFallback.__ftBreakerStrikes = 0;
}

/**
 * هل الخطأ «عطل قاعدة» (اتصال/حصة/مهلة) أم خطأ في الاستعلام نفسه؟
 * أخطاء البيانات/الصياغة (SQLSTATE 22/23/42/0A/21 أو WRONGTYPE في Redis) ليست عطلاً:
 * تحويلها للاحتياط كان يُخفي الخطأ ويُظهر «قاعدة فارغة». هذه تُرمى كما هي.
 */
export function isOutageError(error: unknown): boolean {
  const code = String((error as { code?: unknown })?.code || "");
  if (/^(22|23|42|0A|21|2B|3F|44)/.test(code) && code.length === 5) return false;
  const message = String((error as Error)?.message || "");
  if ((error as Error)?.name === "PermanentError" || /WRONGTYPE|invalid input syntax|violates .* constraint/i.test(message)) return false;
  return true;
}

/* ─────────────────────── السجلّ الدائم للكتابات (journal) ───────────────────────
 *
 * وقت عطل القاعدة الأساسية:
 *   • القراءة والكتابة تمرّان على مخزن احتياطي **دائم** (Redis، مساحة ftb:fb:)
 *     إن كان مهيّأ؛ وإلا على ذاكرة العملية كحلّ أخير (ويظهر ذلك في /api/health).
 *   • كل كتابة تُسجَّل في قائمة دائمة (journal) لتُعاد حين ترجع القاعدة.
 *
 * ⚠️ قاعدة الأمان عند الإعادة: **لا نكتب أبداً فوق سجلّ موجود في القاعدة الأساسية**.
 * الكتابات المحسوبة وقت العطل انطلقت من حالة فارغة (مستخدم «جديد» برصيد 0…)،
 * فإعادتها كما هي كانت ستمحو البيانات الحقيقية. لذلك:
 *   – العمليات التراكمية (incr / zIncr / sAdd / listPush / appendLedger) تُعاد كما هي.
 *   – set / setIfAbsent تُطبَّق فقط إن كان المفتاح غير موجود (NX).
 *   – set على مفتاح موجود، و del / sDel / listPop / delList → لا تُطبَّق، وتُحفظ في
 *     `recovery:conflicts` للمراجعة والدمج اليدوي. لا شيء يُحذف ولا شيء يضيع.
 */
const JOURNAL_KEY = "journal";
export const CONFLICTS_KEY = "recovery:conflicts";
const MEMORY_JOURNAL_CAP = 5000;
const NOT_JOURNALED = new Set<keyof Store>(["acquireLease", "releaseLease"]);
const ADDITIVE = new Set<keyof Store>(["incr", "zIncr", "sAdd", "listPush", "appendLedger"]);

export type FlushResult = { applied: number; conflicts: number; skipped: number; pending: number };

function durable(): Store | null {
  return globalForFallback.__ftDurable || null;
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function noteFallbackError(error: unknown) {
  globalForFallback.__ftFallbackError = { at: Date.now(), message: String((error as Error)?.message || error).slice(0, 200) };
}

/** عملية على الاحتياط: الدائم أولاً، والذاكرة فقط إن فشل هو الآخر (البوت لا يسقط أبداً) */
async function fallbackCall<T>(op: keyof Store, args: unknown[]): Promise<T> {
  const store = durable();
  if (store) {
    const fn = (store as unknown as Record<string, unknown>)[op as string];
    if (typeof fn === "function") {
      try {
        return await (fn as (...a: unknown[]) => Promise<T>).apply(store, args);
      } catch (error) {
        noteFallbackError(error);
      }
    }
  }
  return memoryFallback<T>(op, args);
}

async function journalPush(op: keyof Store, args: unknown[]) {
  if (NOT_JOURNALED.has(op)) return;
  const item: OutboxItem = { id: newId(), op, args, at: Date.now() };
  globalForFallback.__ftJournalDirty = true;
  const store = durable();
  if (store) {
    try {
      await store.listPush(JOURNAL_KEY, [JSON.stringify(item)]);
      return;
    } catch (error) {
      noteFallbackError(error);
    }
  }
  const box = outbox();
  box.push(item);
  // الذاكرة محدودة: نحتفظ بالأحدث (الاحتياط الدائم لا سقف له)
  if (box.length > MEMORY_JOURNAL_CAP) box.splice(0, box.length - MEMORY_JOURNAL_CAP);
}

function sameJson(a: unknown, b: unknown) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

type Outcome = "applied" | "conflict" | "skipped";

/** تطبيق كتابة واحدة على القاعدة الأساسية وفق قاعدة الأمان. يرمي إن كانت القاعدة ما زالت معطّلة. */
async function applyEntry(primary: Store, item: OutboxItem): Promise<{ outcome: Outcome; reason?: string }> {
  const fn = (primary as unknown as Record<string, unknown>)[item.op as string];
  if (typeof fn !== "function" || NOT_JOURNALED.has(item.op)) return { outcome: "skipped" };
  const key = String(item.args[0] ?? "");
  const run = () => (fn as (...a: unknown[]) => Promise<unknown>).apply(primary, item.args);
  if (ADDITIVE.has(item.op)) {
    await run();
    return { outcome: "applied" };
  }
  // مفتاح أُنشئ بهذه الإعادة نفسها (لم يكن موجوداً قبل العطل) → تحديثاته اللاحقة آمنة
  const ownKey = `journal:own:${key}`;
  if (item.op === "set" || item.op === "setIfAbsent") {
    const created = await primary.setIfAbsent(key, item.args[1]);
    if (created) {
      await primary.set(ownKey, 1);
      return { outcome: "applied" };
    }
    if (item.op === "setIfAbsent") return { outcome: "skipped" };
    if (await primary.get(ownKey)) {
      await primary.set(key, item.args[1]);
      return { outcome: "applied" };
    }
    if (sameJson(await primary.get(key), item.args[1])) return { outcome: "skipped" };
    return { outcome: "conflict", reason: "المفتاح موجود في القاعدة الأساسية — لم يُكتب فوقه" };
  }
  if (item.op === "del" && (await primary.get(ownKey))) {
    await run();
    return { outcome: "applied" };
  }
  // حذف مفتاح غير موجود أصلاً في الأساسية = لا شيء يُراجَع
  if (item.op === "del" && (await primary.get(key)) === null) return { outcome: "skipped" };
  // del / sDel / listPop / delList: حذف محسوب على حالة فارغة → لا يُنفَّذ تلقائياً
  return { outcome: "conflict", reason: "عملية حذف وقت العطل — تحتاج مراجعة" };
}

async function readJournal(limit: number): Promise<{ items: OutboxItem[]; source: "durable" | "memory" }> {
  const store = durable();
  if (store) {
    try {
      // LPUSH يضع الأحدث في الرأس؛ listRecent يرجّع الذيل (الأقدم) مرتّباً من الأقدم
      const lines = await store.listRecent(JOURNAL_KEY, limit);
      const items = lines.flatMap((line) => {
        try {
          const row = JSON.parse(line) as OutboxItem;
          return row && typeof row.op === "string" && Array.isArray(row.args) ? [row] : [{ id: newId(), op: "noop" as keyof Store, args: [], at: 0 }];
        } catch {
          return [{ id: newId(), op: "noop" as keyof Store, args: [], at: 0 }];
        }
      });
      if (items.length) return { items, source: "durable" };
    } catch (error) {
      noteFallbackError(error);
    }
  }
  return { items: outbox().slice(0, limit), source: "memory" };
}

async function flushOnce(primary: Store): Promise<FlushResult> {
  const result: FlushResult = { applied: 0, conflicts: 0, skipped: 0, pending: 0 };
  // 🔒 نسخة واحدة فقط تعيد السجلّ (القفل على القاعدة الأساسية؛ فشله = القاعدة ما زالت معطّلة)
  const token = newId();
  if (!(await primary.acquireLease("journal:flush", token, 120_000))) {
    result.pending = await journalLength();
    return result;
  }
  try {
    const deadline = Date.now() + 20_000;
    for (;;) {
      const { items, source } = await readJournal(200);
      if (!items.length) break;
      for (const item of items) {
        const marker = `journal:applied:${item.id}`;
        if (!(await primary.get(marker))) {
          let applied: { outcome: Outcome; reason?: string };
          try {
            applied = await applyEntry(primary, item);
          } catch (error) {
            // القاعدة ما زالت معطّلة → نتوقف ونترك السطر. خطأ في السطر نفسه → تعارض (لا يسدّ الطابور).
            if (isOutageError(error)) throw error;
            applied = { outcome: "conflict", reason: `فشل التطبيق: ${String((error as Error)?.message || error).slice(0, 160)}` };
          }
          const { outcome, reason } = applied;
          if (outcome === "conflict") {
            await primary.listPush(CONFLICTS_KEY, [JSON.stringify({ ...item, reason })]);
            result.conflicts += 1;
          } else if (outcome === "applied") result.applied += 1;
          else result.skipped += 1;
          await primary.set(marker, item.at || Date.now());
        }
        // لا نزيل السطر إلا بعد تطبيقه وتسجيل علامته
        if (source === "durable") await durable()!.listPop(JOURNAL_KEY);
        else outbox().shift();
      }
      if (Date.now() > deadline) break;
    }
  } finally {
    await primary.releaseLease("journal:flush", token).catch(() => undefined);
  }
  result.pending = await journalLength();
  if (!result.pending) globalForFallback.__ftJournalDirty = false;
  globalForFallback.__ftLastFlush = { ...result, at: Date.now() };
  return result;
}

/**
 * إعادة الكتابات المتراكمة وقت العطل إلى القاعدة الأساسية (تلقائياً عند أول نجاح،
 * ومن الكرون). تتوقف عند أول فشل وتترك الباقي في السجلّ — لا شيء يُحذف قبل تطبيقه.
 */
export async function flushOutbox(primary?: Store): Promise<FlushResult> {
  const target = primary || globalForStorePrimary();
  if (!target) return { applied: 0, conflicts: 0, skipped: 0, pending: await journalLength() };
  if (globalForFallback.__ftFlushing) return globalForFallback.__ftFlushing;
  const job = flushOnce(target)
    .catch(async () => ({ applied: 0, conflicts: 0, skipped: 0, pending: await journalLength() }))
    .finally(() => {
      globalForFallback.__ftFlushing = null;
    });
  globalForFallback.__ftFlushing = job;
  return job;
}

export async function journalLength(): Promise<number> {
  let n = outbox().length;
  const store = durable();
  if (store) {
    try {
      n += await store.listLen(JOURNAL_KEY);
    } catch (error) {
      noteFallbackError(error);
    }
  }
  return n;
}

/**
 * كتلفّ المخزن الحقيقي. ما كتبدّلش الشكل: نفس الواجهة بالضبط.
 * `fallback` = مخزن احتياطي دائم (اختياري)؛ بدونه نرجع لذاكرة العملية.
 */
export function resilient(primary: Store, fallback: Store | null = null): Store {
  globalForFallback.__ftDurable = fallback;

  async function degradedCall<T>(op: keyof Store, args: unknown[]): Promise<T> {
    if (WRITE_OPS.has(op)) await journalPush(op, args);
    return fallbackCall<T>(op, args);
  }

  async function call<T>(op: keyof Store, ...args: unknown[]): Promise<T> {
    const fn = (primary as unknown as Record<string, unknown>)[op as string];
    if (typeof fn !== "function") return fallbackCall<T>(op, args);
    // ⚡ القاطع مفتوح = القاعدة معروفة معطّلة الآن: لا ننتظرها أصلاً
    if (breakerOpen()) return degradedCall<T>(op, args);
    try {
      const result = await (fn as (...a: unknown[]) => Promise<T>).apply(primary, args);
      const wasDegraded = Boolean(globalForFallback.__ftDegradedSince);
      resetBreaker();
      noteSuccess();
      // رجعت القاعدة؟ نعيد الكتابات التي فاتت (بقاعدة الأمان: بلا كتابة فوق الموجود)
      if (wasDegraded || globalForFallback.__ftJournalDirty || outbox().length) {
        void flushOutbox(primary).catch(() => undefined);
      }
      return result;
    } catch (error) {
      if (!isOutageError(error)) {
        // خطأ استعلام حقيقي: لا قاطع ولا احتياط — يظهر في السجل ويُرمى للمنادي
        void logError("store", error, { kind: `query:${String(op)}` }, { throttleMs: 30_000 }).catch(() => undefined);
        throw error;
      }
      tripBreaker();
      noteFailure(op, error);
      return degradedCall<T>(op, args);
    }
  }

  const wrapper: Store = {
    backend: primary.backend,
    get: <T = unknown>(key: string) => call<T>("get", key),
    getMany: <T = unknown>(keys: string[]) => call<(T | null)[]>("getMany", keys),
    set: (key: string, value: unknown) => call<void>("set", key, value),
    del: (key: string) => call<void>("del", key),
    incr: (key: string, by?: number) => call<number>("incr", key, by ?? 1),
    sAdd: (key: string, member: string) => call<boolean>("sAdd", key, member),
    sHas: (key: string, member: string) => call<boolean>("sHas", key, member),
    sCard: (key: string) => call<number>("sCard", key),
    sDel: (key: string, member: string) => call<void>("sDel", key, member),
    sMembers: (key: string) => call<string[]>("sMembers", key),
    zIncr: (key: string, member: string, by?: number) => call<number>("zIncr", key, member, by ?? 1),
    zScore: (key: string, member: string) => call<number>("zScore", key, member),
    zTop: (key: string, limit: number) => call<ZItem[]>("zTop", key, limit),
    zCount: (key: string) => call<number>("zCount", key),
    listPush: (key: string, values: string[]) => call<number>("listPush", key, values),
    listPop: (key: string) => call<string | null>("listPop", key),
    listLen: (key: string) => call<number>("listLen", key),
    listAll: (key: string, limit?: number) => call<string[]>("listAll", key, limit ?? 1000),
    listRecent: (key: string, limit?: number) => call<string[]>("listRecent", key, limit ?? 1000),
    delList: (key: string) => call<void>("delList", key),
    setIfAbsent: (key: string, value: unknown) => call<boolean>("setIfAbsent", key, value),
    appendLedger: (entry: LedgerEntry) => call<void>("appendLedger", entry),
    readLedger: (limit?: number, userId?: string) => call<LedgerEntry[]>("readLedger", limit ?? 200, userId),
    acquireLease: (key: string, token: string, ttlMs: number) => call<boolean>("acquireLease", key, token, ttlMs),
    releaseLease: (key: string, token: string) => call<void>("releaseLease", key, token),
  };
  if (!primary.getMany) delete wrapper.getMany;
  if (!primary.appendLedger) delete wrapper.appendLedger;
  if (!primary.readLedger) delete wrapper.readLedger;
  return wrapper;
}

const globalForStorePrimary = (): Store | undefined =>
  (globalThis as unknown as { __ftStorePrimary?: Store }).__ftStorePrimary;

/** حالة الصمود — كتظهر في /api/health واللوحة */
export function degradationInfo() {
  const since = globalForFallback.__ftDegradedSince;
  const last = globalForFallback.__ftLastStoreError;
  return {
    degraded: Boolean(since),
    since,
    /** أين تذهب البيانات وقت العطل: redis = دائم، memory = مؤقت يضيع */
    fallback: durable() ? ("redis" as const) : ("memory" as const),
    fallbackError: globalForFallback.__ftFallbackError?.message || "",
    pendingWrites: outbox().length,
    lastFlush: globalForFallback.__ftLastFlush || null,
    lastError: last ? { at: last.at, message: last.message } : null,
    healthyAt: globalForFallback.__ftHealthyAt || null,
  };
}

/** كيتستعمل من getStore باش نخزّنو الأساسي للـ flush */
export function setStorePrimary(store: Store) {
  (globalThis as unknown as { __ftStorePrimary?: Store }).__ftStorePrimary = store;
}
