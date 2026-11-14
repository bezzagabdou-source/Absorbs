import crypto from "node:crypto";
import { getStore } from "./store";

/**
 * إحصائيات سريعة: زيارات الموقع + الزوار الفريدين + نشاط مستخدمي البوت.
 * كل الأرقام محفوظة في نفس طبقة التخزين (Redis/Postgres/ذاكرة).
 */

const TZ = "Africa/Algiers";

const KEYS = {
  visitsTotal: "stats:visits:total",
  messagesTotal: "stats:messages:total",
  visits: (day: string) => `stats:visits:${day}`,
  uniques: (day: string) => `stats:uniq:${day}`,
  active: (day: string) => `stats:active:${day}`,
  activeHour: (bucket: string) => `stats:hour:${bucket}`,
  messages: (day: string) => `stats:messages:${day}`,
};

/** يوم بصيغة YYYY-MM-DD بتوقيت الجزائر */
export function dayKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hourBucket(date: Date = new Date()): string {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return `${dayKey(date)}-${hour}`;
}

/** آخر N يوم (الأحدث أولاً) */
export function recentDays(count = 7): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = dayKey(d);
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** يقرأ عدّاداً بدون تغييره (incr بمقدار 0 يرجّع القيمة الحالية) */
async function readCounter(key: string): Promise<number> {
  try {
    return Number(await getStore().incr(key, 0)) || 0;
  } catch {
    return 0;
  }
}

function fingerprint(ip: string, ua: string): string {
  return crypto.createHash("sha1").update(`${ip}|${ua}`).digest("hex").slice(0, 16);
}

/** زيارة للموقع (تُسجَّل مرة واحدة لكل صفحة) */
export async function trackVisit(meta: { ip?: string; ua?: string }): Promise<void> {
  try {
    const store = getStore();
    const day = dayKey();
    await Promise.all([
      store.incr(KEYS.visits(day)),
      store.incr(KEYS.visitsTotal),
      store.sAdd(KEYS.uniques(day), fingerprint(meta.ip || "unknown", meta.ua || "")),
    ]);
  } catch {
    /* الإحصائيات لا يجب أن تعطّل الموقع */
  }
}

/** مستخدم نشط في البوت */
export async function trackBotActivity(userId: string | number): Promise<void> {
  try {
    const store = getStore();
    const day = dayKey();
    const member = String(userId);
    await Promise.all([
      store.sAdd(KEYS.active(day), member),
      store.sAdd(KEYS.activeHour(hourBucket()), member),
    ]);
  } catch {
    /* تجاهل */
  }
}

/** رسالة/تحديث استقبله البوت */
export async function trackBotMessage(): Promise<void> {
  try {
    await Promise.all([
      getStore().incr(KEYS.messages(dayKey())),
      getStore().incr(KEYS.messagesTotal),
    ]);
  } catch {
    /* تجاهل */
  }
}

export type DayStats = {
  day: string;
  visits: number;
  uniques: number;
  active: number;
  messages: number;
};

export type StatsSnapshot = {
  days: DayStats[];
  visitsToday: number;
  uniquesToday: number;
  activeToday: number;
  messagesToday: number;
  activeOnline: number;
  active7: number;
  visitsTotal: number;
  messagesTotal: number;
};

export async function getStats(days = 7): Promise<StatsSnapshot> {
  const store = getStore();
  const keys = recentDays(days);

  const rows = await Promise.all(
    keys.map(async (day) => ({
      day,
      visits: await readCounter(KEYS.visits(day)),
      uniques: await store.sCard(KEYS.uniques(day)),
      active: await store.sCard(KEYS.active(day)),
      messages: await readCounter(KEYS.messages(day)),
    })),
  );

  const bucket = hourBucket();
  const previousBucket = hourBucket(new Date(Date.now() - 3_600_000));
  const [onlineNow, onlinePrev] = await Promise.all([
    store.sCard(KEYS.activeHour(bucket)),
    store.sCard(KEYS.activeHour(previousBucket)),
  ]);

  const active7 = rows
    .slice(0, Math.min(7, rows.length))
    .reduce((sum, row) => sum + row.active, 0);

  return {
    days: rows,
    visitsToday: rows[0]?.visits || 0,
    uniquesToday: rows[0]?.uniques || 0,
    activeToday: rows[0]?.active || 0,
    messagesToday: rows[0]?.messages || 0,
    activeOnline: onlineNow + onlinePrev,
    active7,
    visitsTotal: await readCounter(KEYS.visitsTotal),
    messagesTotal: await readCounter(KEYS.messagesTotal),
  };
}

/** تصفير الإحصائيات (ما يمسّ المسابقات ولا المستخدمين) */
export async function resetStats(days = 30): Promise<void> {
  const store = getStore();
  const keys = recentDays(days);
  await Promise.all(
    keys.flatMap((day) => [
      store.del(KEYS.visits(day)),
      store.del(KEYS.uniques(day)),
      store.del(KEYS.active(day)),
      store.del(KEYS.messages(day)),
    ]),
  );
  await Promise.all([store.del(KEYS.visitsTotal), store.del(KEYS.messagesTotal)]);
}
