import { getStore } from "./store";
import { POINTS_MAX, POINTS_STEP } from "./types";

/* ══════════════════════════════════════════════════════════════════════════
   نظام النقاط: كل 100 جهة يضيفها المستخدم = نقطة واحدة.
   عند 3 نقاط → البوت يقول للمستخدم يتواصل مع المالك لاستلام جائزة عشوائية.
   ══════════════════════════════════════════════════════════════════════════ */

const INVITES_KEY = "points:invites";
const TOP_KEY = "points:top";
const notifiedKey = (userId: string, points: number) => `points:reward:${userId}:${points}`;

export type PointsState = {
  /** مجموع الجهات المحسوبة للنقاط */
  invites: number;
  /** عدد النقاط الحالية (كل 100 جهة = نقطة، بحد أقصى 3) */
  points: number;
  /** كم جهة باقية للنقطة القادمة */
  toNext: number;
  /** رقم النقطة القادمة (1..3) */
  nextPoint: number;
  /** وصل للحد الأقصى وخاصو يتواصل مع المالك */
  reachedMax: boolean;
  /** الجائزة وصلت للمالك (تم تنبيه المستخدم) */
  announced: boolean;
};

export function pointsFromInvites(invites: number): number {
  return Math.min(POINTS_MAX, Math.floor(Math.max(0, invites) / POINTS_STEP));
}

export async function invitesOf(userId: string): Promise<number> {
  const score = await getStore().zScore(INVITES_KEY, userId);
  return Math.max(0, Number(score) || 0);
}

export async function getPointsState(userId: string): Promise<PointsState> {
  const invites = await invitesOf(userId);
  const points = pointsFromInvites(invites);
  const nextPoint = Math.min(POINTS_MAX, points + 1);
  const toNext = points >= POINTS_MAX ? 0 : nextPoint * POINTS_STEP - invites;
  const announced = points >= POINTS_MAX ? Boolean(await getStore().get<number>(notifiedKey(userId, POINTS_MAX))) : false;
  return { invites, points, toNext, nextPoint, reachedMax: points >= POINTS_MAX, announced };
}

/**
 * نزيد جهة واحدة لرصيد النقاط.
 * ترجع `milestone` إذا وصل المستخدم لنقطة جديدة لأول مرة (باش نبعثو رسالة واحدة فقط لكل نقطة).
 */
export async function creditPoints(userId: string, amount = 1): Promise<{ state: PointsState; milestone: number | null }> {
  const store = getStore();
  if (!/^\d+$/.test(userId) || amount <= 0) {
    return { state: await getPointsState(userId), milestone: null };
  }
  const invites = Math.max(0, Number(await store.zIncr(INVITES_KEY, userId, amount)) || 0);
  const points = pointsFromInvites(invites);
  const state: PointsState = {
    invites,
    points,
    toNext: points >= POINTS_MAX ? 0 : (points + 1) * POINTS_STEP - invites,
    nextPoint: Math.min(POINTS_MAX, points + 1),
    reachedMax: points >= POINTS_MAX,
    announced: false,
  };

  await store.zIncr(TOP_KEY, userId, amount);
  if (points <= 0) return { state, milestone: null };

  // تنبيه واحد فقط لكل نقطة
  const already = await store.get<number>(notifiedKey(userId, points));
  if (already) return { state, milestone: null };
  await store.set(notifiedKey(userId, points), Date.now());
  state.announced = points >= POINTS_MAX;
  return { state, milestone: points };
}

/** أفضل المستخدمين حسب النقاط (للوحة المالك) */
export async function pointsLeaderboard(limit = 10): Promise<{ userId: string; invites: number; points: number }[]> {
  const top = await getStore().zTop(TOP_KEY, limit);
  return top
    .map((row) => ({
      userId: row.member,
      invites: Math.max(0, Number(row.score) || 0),
      points: pointsFromInvites(Number(row.score) || 0),
    }))
    .sort((a, b) => b.invites - a.invites);
}

/** عدد اللي وصلو 3 نقاط (خاص المالك يوزع عليهم جوائز) */
export async function winnersReadyCount(): Promise<number> {
  const rows = await getStore().zTop(TOP_KEY, 500);
  return rows.filter((row) => pointsFromInvites(Number(row.score) || 0) >= POINTS_MAX).length;
}
