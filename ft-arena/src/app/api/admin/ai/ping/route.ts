/**
 * اختبار مباشر لمسار الكونسول الذكي على الإنتاج — محميّ بسرّ الـ webhook.
 * GET /api/admin/ai/ping?key=<WEBHOOK_SECRET>&q=<نص>
 *
 * يقيس: هل الخطة محلية (بلا شبكة)؟ كم استغرقت؟ هل ok صحيحة؟
 * لا يكتب أي شيء في قاعدة البيانات — يخطط فقط ويقيس.
 */
import { env } from "@/lib/env";
import { loadDB } from "@/lib/store";
import { localPlan } from "@/lib/ai-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CASES = [
  "أضف جائزة PlayStation Plus بسعر 45 نقطة",
  "ضيف جائزة كونت بيس 3 بـ 120 نقطة",
  "ارفع مكافأة الإحالة إلى 5 نقاط",
  "اجعل الهدية اليومية من 2 إلى 5 نقاط",
  "غيّر قوانين البوت: ممنوع استخدام أكثر من حساب",
  "أضف مهمة اشترك في قناة @mxabdou مقابل 3 نقاط",
  "جهّز مسابقة نهاية الأسبوع بجائزة 100 نقطة",
  "اطفئ عجلة الحظ",
  "شغل وضع الصيانة",
  "كم عدد الأعضاء؟",
];

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key || key !== env.webhookSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = await loadDB();
  const started = Date.now();
  const rows = CASES.map((q) => {
    const t0 = Date.now();
    const plan = localPlan(q);
    return {
      q,
      actions: plan.actions.map((a) => a.name),
      ms: Date.now() - t0,
      covered: plan.actions.length > 0,
    };
  });

  const covered = rows.filter((r) => r.covered).length;
  return Response.json({
    ok: true,
    aiEnabled: db.settings.ai.enabled,
    provider: db.settings.ai.provider,
    covered: `${covered}/${rows.length}`,
    // كل هذه تُنفَّذ بلا شبكة → لا مهلة ولا خطأ
    allLocal: covered === rows.length,
    totalMs: Date.now() - started,
    rows,
  });
}
