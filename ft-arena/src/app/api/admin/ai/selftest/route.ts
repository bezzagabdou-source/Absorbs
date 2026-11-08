/**
 * اختبار حقيقي لمحرّك الذكاء على الإنتاج — ينفّذ فعلًا ويُرجع ما تغيّر في الوثيقة.
 * محميّ بسرّ الـ webhook: /api/admin/ai/selftest?key=<WEBHOOK_SECRET>
 * كل عملية تُنفَّذ على نسخة معزولة ثم تُلغى (لا تلمس بياناتك).
 */
import { env } from "@/lib/env";
import { freshDB } from "@/lib/defaults";
import { planPrompt, runActions } from "@/lib/ai-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CASES = [
  "ضيف جائزة كونت بيس 3 بـ 120 نقطة",
  "احذف جائزة نتفليكس",
  "خلي سعر نتفليكس 15 نقطة",
  "أضف مهمة اشترك في قناة @mxabdou مقابل 4 نقاط",
  "أنشئ مسابقة رمضان بجائزة 200 نقطة لمدة 10 أيام",
  "احذف مسابقة رمضان",
  "اجعل الهدية اليومية من 3 إلى 6 نقاط",
  "ارفع مكافأة الإحالة إلى 7 نقاط",
  "غير اسم البوت الى مسابقات MX الرسمي",
  "شغل وضع الصيانة",
  "اطفئ عجلة الحظ",
  "أضف قناة اشتراك إضافية @mxabdou2",
  "أضف شريحة عجلة 50 نقطة",
  "غير قوانين البوت: ممنوع استخدام أكثر من حساب واحد",
];

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key || key !== env.webhookSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const rows: Record<string, unknown>[] = [];
  let pass = 0;

  for (const q of CASES) {
    const db = freshDB();
    // حالة أولية واقعية: نفس جوائز/مهام البوت
    const before = {
      rewards: db.rewards.map((r) => `${r.title}:${r.cost}`),
      tasks: db.tasks.map((t) => t.title),
      contests: db.contests.map((c) => c.title),
      wheel: db.wheel.length,
      points: JSON.stringify(db.settings.points),
      botName: db.settings.botName,
      maintenance: db.settings.maintenance,
      features: JSON.stringify(db.settings.features),
      extraJoins: (db.settings.extraJoins ?? []).length,
      rules: db.settings.texts.rules.slice(0, 30),
    };

    const t0 = Date.now();
    let plan;
    try {
      plan = await planPrompt(db, q);
    } catch (e) {
      rows.push({ q, ok: false, error: (e as Error).message.slice(0, 120) });
      continue;
    }
    const results = plan.actions.length ? await runActions(db, plan.actions) : [];
    const ms = Date.now() - t0;

    const after = {
      rewards: db.rewards.map((r) => `${r.title}:${r.cost}`),
      tasks: db.tasks.map((t) => t.title),
      contests: db.contests.map((c) => c.title),
      wheel: db.wheel.length,
      points: JSON.stringify(db.settings.points),
      botName: db.settings.botName,
      maintenance: db.settings.maintenance,
      features: JSON.stringify(db.settings.features),
      extraJoins: (db.settings.extraJoins ?? []).length,
      rules: db.settings.texts.rules.slice(0, 30),
    };

    // التغيّر الحقيقي في الوثيقة — ليس مجرد "ok"
    const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
      (k) => before[k] !== after[k]
    );
    const okAll = results.length > 0 && results.every((r) => r.ok) && changed.length > 0;
    if (okAll) pass += 1;

    rows.push({
      q,
      ok: okAll,
      provider: plan.provider,
      actions: results.map((r) => `${r.name}${r.ok ? "✓" : "✗"}${r.detail ? `=${r.detail}` : ""}`),
      changedFields: changed,
      ms,
      reply: plan.reply.split("\n")[0].slice(0, 120),
    });
  }

  return Response.json({
    ok: pass === CASES.length,
    score: `${pass}/${CASES.length}`,
    ms: rows.reduce((s, r) => s + (Number(r.ms) || 0), 0),
    rows,
  });
}
