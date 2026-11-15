import { randomUUID } from "node:crypto";
import { creditInvite, getPointsConfig } from "./rewards";
import { getStore } from "./store";
import { getUser } from "./users";
import type { BotUser } from "./types";
import type { TgUser } from "./telegram";

export type ReferralRow = {
  at: number;
  contestId: string;
  contestTitle: string;
  inviterId: string;
  inviterName: string;
  inviterUsername: string;
  joinerId: string;
  joinerName: string;
  joinerUsername: string;
  points?: number;
  counted?: boolean;
};

/** رابط مستقل عن وجود مسابقة أو مجموعة، وصالح لكل مستخدم. */
export function generalReferralLink(username: string, userId: string): string {
  return `https://t.me/${username.replace(/^@/, "")}?start=ref_${userId}`;
}

export function parseGeneralReferral(payload: string): string | null {
  return /^ref_(\d{1,20})$/.exec(payload)?.[1] || null;
}

/** تسجيل إحالة عامة لمرة واحدة؛ القفل يمنع تحديثي /start المتزامنين من تكرار الرصيد. */
export async function registerGeneralReferral(from: TgUser, inviterId: string) {
  const joinerId = String(from.id);
  if (from.is_bot || !/^\d{1,20}$/.test(inviterId) || inviterId === joinerId) return null;

  const store = getStore();
  const lockKey = `genref:lock:${joinerId}`;
  const lockToken = randomUUID();
  if (!(await store.acquireLease(lockKey, lockToken, 30_000))) return null;

  try {
    if (await store.sHas("genref:credited", joinerId)) return null;
    const inviter = await getUser(inviterId);
    if (!inviter) return null;

    // لا نحتسب دخولاً سبق تسجيله كرابط مسابقة/مجموعة. فشل القراءة لازم يفشل بوضوح
    // ولا يتحول إلى قرار افتراضي يسمح بإضافة نقاط أو بصمة دائمة.
    const previous = await recentReferrals(500);
    if (previous.some((row) => row.joinerId === joinerId)) return null;

    const config = await getPointsConfig();
    const at = Date.now();
    const joiner: BotUser = {
      id: joinerId,
      firstName: [from.first_name, from.last_name].filter(Boolean).join(" ") || "عضو جديد",
      username: from.username || "",
      joinedAt: at,
    };
    const points = config.enabled ? Math.max(0, Math.min(100000, Math.floor(Number(config.perJoin) || 0))) : 0;

    if (!(await getUser(joinerId))) {
      await store.set(`user:${joinerId}`, joiner);
      await store.zIncr("users:joined", joinerId, at);
      await store.sAdd("users:ids", joinerId);
    }

    // سجل العضو أولاً حتى يبقى الإصلاح الإداري ممكناً إذا تعطل منح النقاط.
    await store.listPush("referrals:log", [JSON.stringify({
      at,
      contestId: "general",
      contestTitle: "إحالة عامة",
      inviterId,
      inviterName: inviter.firstName,
      inviterUsername: inviter.username || "",
      joinerId,
      joinerName: joiner.firstName,
      joinerUsername: joiner.username,
      points,
      counted: true,
    })]);

    // لا نعتبر فشل التخزين نجاحاً. البصمة تكتب بعد تسجيل الإحالة وقبل النقاط
    // لمنع تكرار المنح عند إعادة تسليم webhook؛ ويمكن إصلاح أي فشل نقاط من سجل الإحالات.
    if (!(await store.sAdd("genref:credited", joinerId))) return null;
    if (points > 0) await creditInvite(inviterId);
    return { inviter, joiner, points };
  } finally {
    await store.releaseLease(lockKey, lockToken).catch((error) => {
      console.error("[referrals] تعذّر تحرير قفل الإحالة", error);
    });
  }
}

/** سجل أحدث الإحالات، جاهز للاستعمال في اللوحة دون كشف توكن تيليغرام. */
export async function recentReferrals(limit = 200): Promise<ReferralRow[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit) || 200));
  const rows = await getStore().listRecent("referrals:log", n);
  return rows.flatMap((line: string) => {
    try {
      const row = JSON.parse(line) as ReferralRow;
      return row && /^\d+$/.test(row.inviterId) && /^\d+$/.test(row.joinerId) ? [row] : [];
    } catch {
      return [];
    }
  });
}
