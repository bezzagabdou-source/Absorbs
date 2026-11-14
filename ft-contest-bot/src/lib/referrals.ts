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

/** حساب أول دخول فقط. العملية كلها ذرّية في Redis وPostgres. */
export async function registerGeneralReferral(from: TgUser, inviterId: string) {
  const joinerId = String(from.id);
  if (from.is_bot || !/^\d{1,20}$/.test(inviterId) || inviterId === joinerId) return null;
  const inviter = await getUser(inviterId);
  if (!inviter) return null;
  const config = await getPointsConfig();
  const at = Date.now();
  const joiner: BotUser = {
    id: joinerId,
    firstName: [from.first_name, from.last_name].filter(Boolean).join(" ") || "عضو جديد",
    username: from.username || "",
    joinedAt: at,
  };
  const points = config.enabled ? Math.max(0, Math.min(100000, Math.floor(Number(config.perJoin) || 0))) : 0;
  const store = getStore();
  // 🧱 مرة واحدة في العمر: نفس العضو ما كيتحسبش جوج مرات على نفس الرابط
  const firstEver = await store.sAdd("genref:credited", joinerId).catch(() => true);
  if (!firstEver) return null;
  // 🛡️ إلا كان محسوباً قبل من رابط مسابقة → ما نعاودوش
  const already = new Set((await recentReferrals(500).catch(() => [])).map((row) => row.joinerId));
  if (already.has(joinerId)) return null;
  // 🆕 عضو ما معروفش: نسجلوه بحال بقية الدخول (بدل ما نعيطو لـ register ديال البوت)
  if (!(await getUser(joinerId))) {
    await store.set(`user:${joinerId}`, joiner);
    await store.zIncr("users:joined", joinerId, at);
    await store.sAdd("users:ids", joinerId).catch(() => undefined);
  }
  // 📜 السجل كيتكتب قبل النقاط: إلا طاح الإيداع، إعادة العدّ (referrals_recount) كترجّعو
  await store
    .listPush(
      "referrals:log",
      [
        JSON.stringify({
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
        }),
      ],
    )
    .catch(() => undefined);
  if (points > 0) await creditInvite(inviterId).catch(() => undefined);
  return { inviter, joiner, points };
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
