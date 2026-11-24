import { getStore } from "./store";
import { pushAdminLog, revokeInvite } from "./rewards";
import { revokePoints } from "./points";

/**
 * 🚺 ميزة المراقب × الإحالات: الإحالة اللي يكون فيها العضو الداخل مصنَّف «أنثى» من المراقب
 * ما تتحسبش لصاحب الرابط (لا نتيجة مسابقة، لا نقاط متجر، لا نقاط الدعوات).
 *
 * كيفاش كتخدم:
 *  1) كل إحالة كتتحسب فالأول (باش /start يبقى سريع) وكتتسجّل هنا فـ `refby:<joinerId>`.
 *  2) إلا كان المراقب صنّف الداخل أنثى (قبل أو بعد) → كنرجّعو كل اللي تزاد لصاحب الرابط، مرة وحدة فقط.
 *  3) علامات `refbtot:*` و`refpts:*` و`credited` كتبقى باش إعادة العدّ التلقائية ما ترجّعش الإحالة.
 *
 * تعطيل الميزة كاملة: متغير البيئة FEMALE_REFERRAL_BLOCK=0
 */

export type GuardedCredit = {
  inviterId: string;
  /** null = إحالة عامة (بلا مسابقة) */
  contestId: string | null;
  /** تزادت +1 على نتيجة المسابقة */
  score: boolean;
  /** تزادت نقاط المتجر (creditInvite) */
  shop: boolean;
  /** تزادت نقاط الدعوات (creditPoints) */
  points: boolean;
  at: number;
  revoked?: boolean;
};

const KEY = (joinerId: string) => `refby:${joinerId}`;

export function femaleReferralBlockEnabled(): boolean {
  return process.env.FEMALE_REFERRAL_BLOCK !== "0";
}

/** يسجّل إحالة تحسبات، وإلا كان الداخل مصنَّف أنثى من قبل → يلغيها فوراً. ما يthrow أبداً. */
export async function guardReferralCredit(
  joinerId: string,
  credit: Omit<GuardedCredit, "at" | "revoked">,
): Promise<void> {
  try {
    if (!femaleReferralBlockEnabled() || !/^\d{1,20}$/.test(joinerId)) return;
    const store = getStore();
    const list = (await store.get<GuardedCredit[]>(KEY(joinerId))) || [];
    list.push({ ...credit, at: Date.now() });
    await store.set(KEY(joinerId), list.slice(-5));
    // 🏁 سباق محتمل: المراقب يقدر يكون كمّل قبل ما تتسجّل الإحالة
    const { latestReportFor } = await import("./monitor");
    const report = await latestReportFor(joinerId);
    if (report && report.gender === "female") await revokeCreditsFor(joinerId);
    // ⛔ فحص فوري (اسم/بايو/صورة + ذكاء اصطناعي): إلا طلع بنت → كنرجّعو الإحالة دغيا
    const { screenReferralJoiner } = await import("./referralScreen");
    const verdict = await screenReferralJoiner(joinerId);
    if (verdict.blocked) {
      const revoked = await revokeCreditsFor(joinerId);
      await pushAdminLog({
        at: Date.now(),
        op: "referral_screened",
        detail: `إحالة مرفوضة فوراً: ${credit.inviterId} ← ${joinerId} (${verdict.provider || "فحص"} · ${Math.round(verdict.confidence * 100)}% · ${verdict.evidence || "بلا دليل"}); تراجع ${revoked}`,
        via: "ai",
      }).catch(() => undefined);
    }
  } catch (error) {
    console.error("[referralGuard] guard failed", joinerId, error);
  }
}

/** يرجّع لصاحب/أصحاب الرابط كل ما تزاد بسبب هاد العضو (idempotent). يرجّع عدد الإحالات الملغاة. */
export async function revokeCreditsFor(joinerId: string): Promise<number> {
  try {
    if (!femaleReferralBlockEnabled() || !/^\d{1,20}$/.test(joinerId)) return 0;
    const store = getStore();
    const list = await store.get<GuardedCredit[]>(KEY(joinerId));
    if (!Array.isArray(list) || !list.length) return 0;
    const pending = list.filter((c) => !c.revoked);
    if (!pending.length) return 0;
    // نعلّمو قبل التراجع: حتى لو تعاودات العملية ما يتراجعش جوج مرات
    for (const c of pending) c.revoked = true;
    await store.set(KEY(joinerId), list);

    for (const c of pending) {
      try {
        if (c.score && c.contestId) {
          const key = `contest:${c.contestId}:score`;
          const current = Number(await store.zScore(key, c.inviterId)) || 0;
          if (current > 0) await store.zIncr(key, c.inviterId, -1);
        }
        if (c.shop) await revokeInvite(c.inviterId);
        if (c.points) await revokePoints(c.inviterId);
        await pushAdminLog({
          at: Date.now(),
          op: "referral_revoked",
          detail: `إحالة ملغاة: ${c.inviterId} ← ${joinerId} (المُحال مصنَّفة أنثى من المراقب)`,
          via: "ai",
        }).catch(() => undefined);
      } catch (error) {
        console.error("[referralGuard] revoke failed", c.inviterId, joinerId, error);
      }
    }
    return pending.length;
  } catch (error) {
    console.error("[referralGuard] revokeCreditsFor failed", joinerId, error);
    return 0;
  }
}
