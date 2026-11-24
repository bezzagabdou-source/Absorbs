/**
 * 🚺⛔ فحص فوري لحساب الداخل قبل ما تتحسب الإحالة
 *
 * الهدف: أي شخص كيدخّل «بنت» من رابطو، الإحالة ما تتحسبش **فوراً** — ماشي من بعد
 * ما تتزاد وتتراجع. الفحص كيدير 3 طبقات بالترتيب (الأسرع أولاً):
 *   1) تقرير المراقب المخزّن (`monitor:user:<id>`) — فوري بلا شبكة.
 *   2) محلّل الأسماء والبايو (heuristic) — فوري بلا شبكة (أسماء عربية/لاتينية مؤنثة، بايو).
 *   3) ذكاء اصطناعي حقيقي (Gemini/Groq/OpenRouter) على الصورة + الاسم + البايو،
 *      بحد أقصى للانتظار (REFERRAL_SCREEN_MS، افتراضياً 1200ms) باش /start يبقى سريع.
 *
 * النتيجة كتتخزّن فـ `screen:<id>` باش ما نعاودوش نخلصو على نفس الحساب.
 * تعطيل: FEMALE_REFERRAL_BLOCK=0 أو REFERRAL_SCREEN=0
 */

import { getStore } from "./store";
import { getUser } from "./users";
import type { BotUser } from "./types";

export type ScreenVerdict = {
  blocked: boolean;
  gender: "female" | "male" | "unknown";
  confidence: number;
  evidence: string;
  provider: string;
  source: "report" | "heuristic" | "ai" | "cache" | "off" | "none";
};

const CACHE_KEY = (id: string) => `screen:${id}`;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedVerdict = ScreenVerdict & { at: number };

/** الفحص مفعّل إلا أُطلق FEMALE_REFERRAL_BLOCK=0 أو REFERRAL_SCREEN=0 */
export function screenEnabled(): boolean {
  return process.env.FEMALE_REFERRAL_BLOCK !== "0" && process.env.REFERRAL_SCREEN !== "0";
}

function screenBudgetMs(): number {
  const raw = Number(process.env.REFERRAL_SCREEN_MS);
  if (Number.isFinite(raw) && raw >= 300) return Math.min(5000, Math.floor(raw));
  return 1200;
}

/** نتيجة محفوظة (ما نتجاوزوش 7 أيام). */
export async function cachedVerdict(joinerId: string): Promise<ScreenVerdict | null> {
  try {
    const hit = await getStore().get<CachedVerdict>(CACHE_KEY(joinerId));
    if (!hit || !hit.gender) return null;
    if (Date.now() - Number(hit.at || 0) > CACHE_TTL_MS) return null;
    return { ...hit, source: "cache" };
  } catch {
    return null;
  }
}

async function remember(joinerId: string, verdict: ScreenVerdict): Promise<void> {
  try {
    await getStore().set(CACHE_KEY(joinerId), { ...verdict, at: Date.now() });
  } catch {
    /* التخزين غير متاح: ما نوقفوش الإحالة */
  }
}

function profileOf(user: BotUser | null) {
  const full = String(user?.firstName || "").trim();
  const parts = full.split(/\s+/);
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
    username: String(user?.username || "").replace(/^@/, ""),
    bio: "",
  };
}

/**
 * يفحص الحساب اللي دخل ويرجّع الحكم. ما يthrow أبداً.
 * `quick` = غير الطبقات الفورية (بلا شبكة) — كتستعمل باش /start ما يتأخرش.
 */
export async function screenReferralJoiner(
  joinerId: string,
  options: { quick?: boolean } = {},
): Promise<ScreenVerdict> {
  const none: ScreenVerdict = { blocked: false, gender: "unknown", confidence: 0, evidence: "", provider: "", source: "none" };
  if (!screenEnabled() || !/^\d{1,20}$/.test(joinerId)) return { ...none, source: "off" };

  try {
    const { latestReportFor, heuristicClassify, classifyMember, fetchProfilePhoto } = await import("./monitor");

    // 1) تقرير المراقب
    const cached = await cachedVerdict(joinerId);
    if (cached) return cached;

    const report = await latestReportFor(joinerId);
    if (report && report.gender === "female" && (report.status || "pending") !== "unbanned") {
      const verdict: ScreenVerdict = {
        blocked: true,
        gender: "female",
        confidence: Number(report.confidence) || 0.9,
        evidence: report.evidence || "المراقب صنّفه أنثى",
        provider: report.provider || "المراقب",
        source: "report",
      };
      await remember(joinerId, verdict);
      return verdict;
    }

    const user = await getUser(joinerId);
    const profile = profileOf(user);

    // 2) محلّل الأسماء والبايو (فوري)
    const guess = heuristicClassify(profile);
    if (guess && guess.gender === "female" && Number(guess.confidence) >= 0.8) {
      const verdict: ScreenVerdict = {
        blocked: true,
        gender: "female",
        confidence: Number(guess.confidence) || 0.85,
        evidence: guess.evidence || "",
        provider: guess.provider || "تحليل الأسماء",
        source: "heuristic",
      };
      await remember(joinerId, verdict);
      return verdict;
    }

    if (options.quick) return none;

    // 3) ذكاء اصطناعي (بميزانية وقت صغيرة)
    const photo = await Promise.race([
      fetchProfilePhoto(joinerId).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), Math.min(800, screenBudgetMs()))),
    ]);
    const ai = await Promise.race([
      classifyMember({ photo, ...profile }).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), screenBudgetMs())),
    ]);
    if (ai && ai.gender === "female" && Number(ai.confidence) >= 0.6) {
      const verdict: ScreenVerdict = {
        blocked: true,
        gender: "female",
        confidence: Number(ai.confidence) || 0.7,
        evidence: ai.evidence || "",
        provider: ai.provider || "ذكاء اصطناعي",
        source: "ai",
      };
      await remember(joinerId, verdict);
      return verdict;
    }
    return none;
  } catch {
    return none;
  }
}
