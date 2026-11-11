/**
 * اختبار حقيقي لمحرّك الذكاء على الإنتاج — ينفّذ فعلًا ويُرجع ما تغيّر في الوثيقة.
 * محميّ بسرّ الـ webhook: /api/admin/ai/selftest?key=<WEBHOOK_SECRET>
 * كل عملية تُنفَّذ على نسخة معزولة ثم تُلغى (لا تلمس بياناتك).
 */
import { env } from "@/lib/env";
import { loadDB, readFresh } from "@/lib/store";
import { freshDB } from "@/lib/defaults";
import { planPrompt, runActions } from "@/lib/ai-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Case = { q: string; expectOk?: boolean };

const CASES: (string | Case)[] = [
  "ضيف جائزة كونت بيس 3 بـ 120 نقطة",
  "احذف جائزة نتفليكس",
  "خلي سعر نتفليكس 15 نقطة",
  "أضف مهمة اشترك في قناة @mxabdou مقابل 4 نقاط",
  "أنشئ مسابقة رمضان بجائزة 200 نقطة لمدة 10 أيام",
  { q: "احذف مسابقة رمضان", expectOk: false }, // لا وجود لها → يجب أن يفشل بصراحة
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

  const real = new URL(req.url).searchParams.get("real") === "1";
  const rows: Record<string, unknown>[] = [];
  let pass = 0;

  for (const item of CASES) {
    const q = typeof item === "string" ? item : item.q;
    const expectOk = typeof item === "string" ? true : item.expectOk !== false;
    // real=1 → نُنفّذ على قاعدة الإنتاج الفعلية ثم نقرأها من Redis للتأكيد
    const db = real ? await loadDB() : freshDB();
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
    let results: { name: string; ok: boolean; detail?: string }[] = [];
    if (plan.actions.length) {
      if (real) {
        const { mutate } = await import("@/lib/store");
        results = await mutate((live) => runActions(live, plan.actions));
      } else {
        results = await runActions(db, plan.actions);
      }
    }
    const ms = Date.now() - t0;
    // في الوضع الحقيقي نقرأ من Redis لنُثبت أن التغيير وصل للتخزين
    if (real) {
      const fresh = await readFresh();
      if (fresh) Object.assign(db, fresh);
    }

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
    const snap = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
    const changed = (Object.keys(before) as (keyof typeof before)[]).filter(
      (k) => snap(before[k]) !== snap(after[k])
    );
    const okAll = expectOk
      ? results.length > 0 && results.every((r) => r.ok) && changed.length > 0
      : results.length > 0 && results.every((r) => !r.ok) && changed.length === 0;
    if (okAll) pass += 1;

    rows.push({
      q,
      ok: okAll,
      expectOk,
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
