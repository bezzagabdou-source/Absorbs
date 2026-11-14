/**
 * 🛡️ حماية الطلبات داخل البوت: منع تكرار التحديثات + حدّ للرشق (rate limiting).
 *
 *  • منع التكرار: تيليغرام كيعاود يصيفط نفس `update_id` إلا تأخّر الرد، وهذا كيخلّي
 *    الإحالات والنقاط تتضاعف. كنحفظو المعالَج في المخزن (مشترك بين النسخ) وفي
 *    الذاكرة (سريع بلا قاعدة بيانات).
 *  • الرشق: نافذة دقيقة لكل مستخدم + نافذة للنداءات المشبوهة، والنتيجة كتظهر في
 *    سجل الأخطاء باش المالك يعرف إلا كاين سبام.
 */
import { getStore } from "./store";
import { logError } from "./errors";

const memoryGlobal = globalThis as unknown as {
  __ftSeenUpdates?: Map<number, number>;
  __ftFlood?: Map<string, number[]>;
};

const SEEN_TTL_MS = 10 * 60_000;

/**
 * يرجّع true إلا كان التحديث جديد (ما تعالجش قبل).
 *
 * ⚠️ `update_id` فريد **لكل بوت**، ماشي لكل بوتّات الحساب. البوت التاني كيتسجّل
 * على نفس الرابط بـ `?bot=2` وكيقدر يجيب نفس الأرقام، فبلا ما نفصلو بالمفتاح
 * تحديثات البوت التاني كانت غادي تتIgnore كـ «مكرّرة».
 */
export async function claimUpdate(updateId: number | undefined | null, bot = "1"): Promise<boolean> {
  const id = Number(updateId);
  if (!Number.isFinite(id) || id <= 0) return true; // بلا معرّف: ما نمنعوش
  const key = Number(`${bot === "2" ? 2 : 1}${String(id).padStart(12, "0")}`);
  memoryGlobal.__ftSeenUpdates ||= new Map();
  const seen = memoryGlobal.__ftSeenUpdates;
  const now = Date.now();
  for (const [k, at] of seen) if (now - at > SEEN_TTL_MS) seen.delete(k);
  if (seen.has(key)) return false;
  seen.set(key, now);
  try {
    // مصدر الحقيقة: المخزن المشترك (Redis/Postgres) باش حتى النسخ الأخرى تعرف
    const field = new Date().toISOString().slice(0, 10);
    const added = await getStore().sAdd(`updates:seen:${bot === "2" ? "b2:" : ""}${field}`, String(id));
    return added;
  } catch (error) {
    void logError("store", error, { kind: "claimUpdate" }).catch(() => undefined);
    return true; // فشل التخزين ما يمنعش خدمة المستخدم
  }
}

/** ينظّف مجموعات التحديثات القديمة (من الكرون اليومي) */
export async function cleanupSeenUpdates(keepDays = 2): Promise<number> {
  const store = getStore();
  let removed = 0;
  for (let i = keepDays; i <= keepDays + 5; i++) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    try {
      const members = await store.sMembers(`updates:seen:${day}`);
      if (!members.length) continue;
      await store.del(`updates:seen:${day}`);
      removed += members.length;
    } catch {
      /* تجاهل: التنظيف ما خاصوش يكسر الكرون */
    }
  }
  return removed;
}

export type RateResult = { allowed: boolean; count: number; retryAfterMs: number };

/**
 * حدّ بسيط وصلب لكل مستخدم خلال نافذة زمنية.
 * `scope` كيفصل الحدود (رسائل / أزرار / ذكاء اصطناعي).
 */
export function rateLimit(userId: string | number, scope: string, max: number, windowMs: number): RateResult {
  memoryGlobal.__ftFlood ||= new Map();
  const map = memoryGlobal.__ftFlood;
  const key = `${scope}:${userId}`;
  const now = Date.now();
  const hits = (map.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  map.set(key, hits);
  if (map.size > 8000) {
    // تنظيف دوري بسيط: نمسحو المدخلات اللي ما فيهاش نشاط حديث
    for (const [k, list] of map) {
      if (!list.length || now - list[list.length - 1] > windowMs) map.delete(k);
    }
  }
  const allowed = hits.length <= max;
  return { allowed, count: hits.length, retryAfterMs: allowed ? 0 : Math.max(1000, windowMs - (now - hits[0])) };
}
