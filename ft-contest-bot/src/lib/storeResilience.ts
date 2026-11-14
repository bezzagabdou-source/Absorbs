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
};

type OutboxItem = { op: keyof Store; args: unknown[]; at: number };

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
 * كتلفّ المخزن الحقيقي. ما كتبدّلش الشكل: نفس الواجهة بالضبط.
 */
/**
 * ⚡ قاطع دائرة: أول عطل كيوقف المحاولات لمدة قصيرة، بعدها محاولة استكشاف
 * وحدة. بلا هادشي كل رسالة كتسنّى 15 ثانية ديال مهلة Postgres قبل ما ترجع
 * للذاكرة → البوت كيبان بطيء/ميّت. دابا: أول رسالة كتخلص بسرعة، والباقي فوراً.
 */
const BREAKER_MS = 30_000;

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

export function resilient(primary: Store): Store {
  /** كتغلّف كل نداء: كتجرّب الأساسي، وإلا كتنزل على الذاكرة */
  async function call<T>(op: keyof Store, ...args: unknown[]): Promise<T> {
    const fn = (primary as unknown as Record<string, unknown>)[op as string];
    if (typeof fn !== "function") {
      return memoryFallback<T>(op, args);
    }
    // ⚡ القاطع مفتوح = القاعدة معروفة طايحة دابا: ما كنسنّاوش عليها أصلاً
    if (breakerOpen()) {
      if (WRITE_OPS.has(op)) {
        outbox().push({ op, args, at: Date.now() });
        if (outbox().length > 500) outbox().splice(0, outbox().length - 500);
      }
      return memoryFallback<T>(op, args);
    }
    try {
      const result = await (fn as (...a: unknown[]) => Promise<T>).apply(primary, args);
      resetBreaker();
      noteSuccess();
      // رجع المخزن؟ كنفرّغو الـ outbox (الكتابات اللي فاتت)
      if (outbox().length) void flushOutbox(primary).catch(() => undefined);
      return result;
    } catch (error) {
      tripBreaker();
      noteFailure(op, error);
      if (WRITE_OPS.has(op)) {
        // كنحفظوها باش تتطبّق أول مرة يرجع المخزن — وما كنخسّروش الطلب
        outbox().push({ op, args, at: Date.now() });
        if (outbox().length > 500) outbox().splice(0, outbox().length - 500);
      }
      return memoryFallback<T>(op, args);
    }
  }

  const wrapper: Store = {
    backend: primary.backend,
    get: <T = unknown>(key: string) => call<T>("get", key),
    getMany: <T = unknown>(keys: string[]) => call<(T | null)[]>("getMany", keys),
    set: (key: string, value: unknown) => call<void>("set", key, value),
    del: (key: string) => call<void>("del", key),
    incr: (key: string, by?: number) => call<number>("incr", key, by),
    sAdd: (key: string, member: string) => call<boolean>("sAdd", key, member),
    sHas: (key: string, member: string) => call<boolean>("sHas", key, member),
    sCard: (key: string) => call<number>("sCard", key),
    sDel: (key: string, member: string) => call<void>("sDel", key, member),
    sMembers: (key: string) => call<string[]>("sMembers", key),
    zIncr: (key: string, member: string, by?: number) => call<number>("zIncr", key, member, by),
    zScore: (key: string, member: string) => call<number>("zScore", key, member),
    zTop: (key: string, limit: number) => call<ZItem[]>("zTop", key, limit),
    zCount: (key: string) => call<number>("zCount", key),
    listPush: (key: string, values: string[]) => call<number>("listPush", key, values),
    listPop: (key: string) => call<string | null>("listPop", key),
    listLen: (key: string) => call<number>("listLen", key),
    listAll: (key: string, limit?: number) => call<string[]>("listAll", key, limit),
    listRecent: (key: string, limit?: number) => call<string[]>("listRecent", key, limit),
    delList: (key: string) => call<void>("delList", key),
    setIfAbsent: (key: string, value: unknown) => call<boolean>("setIfAbsent", key, value),
    appendLedger: (entry: LedgerEntry) => call<void>("appendLedger", entry),
    readLedger: (limit?: number, userId?: string) => call<LedgerEntry[]>("readLedger", limit, userId),
    acquireLease: (key: string, token: string, ttlMs: number) => call<boolean>("acquireLease", key, token, ttlMs),
    releaseLease: (key: string, token: string) => call<void>("releaseLease", key, token),
  };
  // الدوال الاختيارية: نطيّحوها غير إلا كانت موجودة في الأساسي أو كنديرو الاحتياط
  if (!primary.getMany) delete wrapper.getMany;
  if (!primary.appendLedger) delete wrapper.appendLedger;
  if (!primary.readLedger) delete wrapper.readLedger;
  return wrapper;
}

/**
 * تطبيق الكتابات المتراكمة وقت العطل. كتستدعى تلقائياً أول نداء ناجح، ويمكن
 * استدعاؤها من الكرون. ما كتعاودش أي عملية فشلت (كتخلّيها في الـ outbox).
 */
export async function flushOutbox(primary?: Store): Promise<{ applied: number; pending: number }> {
  const target = primary || globalForStorePrimary();
  if (!target) return { applied: 0, pending: outbox().length };
  const items = outbox().splice(0, outbox().length);
  let applied = 0;
  for (const item of items) {
    const fn = (target as unknown as Record<string, unknown>)[item.op as string];
    if (typeof fn !== "function") continue;
    try {
      await (fn as (...a: unknown[]) => Promise<unknown>).apply(target, item.args);
      applied++;
    } catch {
      // باقي طايح: نرجّعوها للـ outbox ونوقفو باش ما نضغطوش على القاعدة
      outbox().push(item);
      outbox().push(...items.slice(items.indexOf(item) + 1));
      break;
    }
  }
  return { applied, pending: outbox().length };
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
    pendingWrites: outbox().length,
    lastError: last ? { at: last.at, message: last.message } : null,
    healthyAt: globalForFallback.__ftHealthyAt || null,
  };
}

/** كيتستعمل من getStore باش نخزّنو الأساسي للـ flush */
export function setStorePrimary(store: Store) {
  (globalThis as unknown as { __ftStorePrimary?: Store }).__ftStorePrimary = store;
}
