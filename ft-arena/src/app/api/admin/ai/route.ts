/** 🧠 واجهة الكونسول الذكي (HTTP) — المنطق في src/lib/ai-brain.ts */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { planPrompt, runActions } from "@/lib/ai-brain";
import { detectAIProviders } from "@/lib/env";

/** يبني ردًّا صادقًا 100% من نتائج التنفيذ الفعلية (لا وعود وهمية). */
function summarize(modelReply: string, results: { name: string; ok: boolean; detail?: string }[], applied: boolean) {
  const AR: Record<string, string> = {
    set_points: "تعديل النقاط",
    set_texts: "تحديث النصوص",
    set_bot: "إعدادات البوت",
    set_feature: "تشغيل/إيقاف ميزة",
    set_force_join: "قناة الاشتراك",
    set_extra_join: "قناة إضافية",
    add_reward: "إضافة جائزة",
    edit_reward: "تعديل جائزة",
    delete_reward: "حذف جائزة",
    set_price: "تعديل سعر",
    add_task: "إضافة مهمة",
    edit_task: "تعديل مهمة",
    delete_task: "حذف مهمة",
    add_contest: "إنشاء مسابقة",
    edit_contest: "تعديل مسابقة",
    delete_contest: "حذف مسابقة",
    add_points: "تعديل رصيد عضو",
    set_points_for: "تعيين رصيد عضو",
    ban_user: "حظر عضو",
    unban_user: "فك الحظر",
    vip_user: "ترقية VIP",
    broadcast: "بث جماعي",
    add_wheel_slice: "شريحة عجلة",
  };

  if (!applied) {
    if (results.length === 0) {
      return `${modelReply}\n\n(عرض فقط — لم يُنفَّذ شيء في البوت.)`;
    }
    const failed = results.map((r) => `• ${AR[r.name] ?? r.name}: ${r.detail ?? "فشل"}`).join("\n");
    return `⚠️ لم أستطع تنفيذ الطلب:\n${failed}`;
  }

  const ok = results.filter((r) => r.ok);
  const bad = results.filter((r) => !r.ok);
  const lines: string[] = [];

  if (ok.length) {
    lines.push(`✅ تم التنفيذ فعليًا في البوت (${ok.length} عملية):`);
    for (const r of ok) {
      const label = AR[r.name] ?? r.name;
      lines.push(`• ${label}${r.detail ? ` — ${r.detail}` : ""}`);
    }
  }
  if (bad.length) {
    lines.push("");
    lines.push(`⚠️ لم تُنفَّذ (${bad.length}):`);
    for (const r of bad) lines.push(`• ${AR[r.name] ?? r.name} — ${r.detail ?? "فشل"}`);
  }
  // عند التنفيذ الفعلي: القائمة أعلاه هي الحقيقة. لا نُقحم كلام الموديل حتى لا يتناقض معها.
  // نُظهره فقط إن لم يُنفَّذ شيء أو إن كانت النتيجة كلها فشلًا (ليشرح السبب).
  if (!ok.length && modelReply) lines.unshift(modelReply, "");
  return lines.join("\n");
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const g = await guard();
  if (g) return g;
  const db = await loadDB();
  const saved = Boolean((db.settings.ai?.apiKey ?? "").trim());
  return json({
    ok: true,
    logs: db.logs.slice(0, 30),
    // لا نُعيد المفتاح نفسه أبدًا للواجهة
    settings: { ...db.settings.ai, apiKey: saved ? "saved" : "" },
    providers: detectAIProviders()
      .filter((p) => p.configured)
      .map((p) => ({ name: p.name, configured: p.configured })),
    ready: saved || detectAIProviders().some((p) => p.configured),
  });
}

export async function POST(req: Request) {
  const g = await guard();
  if (g) return g;
  let body: { prompt?: string; apply?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return bad("JSON غير صالح");
  }
  const prompt = (body.prompt ?? "").trim();
  if (prompt.length < 2) return bad("اكتب طلبك أولًا");
  if (prompt.length > 4000) return bad("الطلب طويل جدًا");

  try {
    const db0 = await loadDB();
    const plan = await planPrompt(db0, prompt);
    const shouldApply = body.apply !== false;
    let results: { name: string; ok: boolean; detail?: string }[] = [];

    results = await mutate(async (db) => {
      const r = shouldApply && plan.actions.length ? await runActions(db, plan.actions) : [];
      // نستبدل رد النموذج بتأكيد مبني على النتائج الفعلية — لا ادّعاء بلا تنفيذ
      const verified = summarize(plan.reply, r, shouldApply);
      db.logs.unshift({
        at: new Date().toISOString(),
        prompt,
        reply: verified,
        provider: plan.provider,
        actions: r,
      });
      if (db.logs.length > 100) db.logs.length = 100;
      logActivity(db, {
        actor: "ai",
        icon: "🧠",
        title: "أمر ذكي",
        detail: `${plan.actions.map((a) => a.name).join(" • ") || "عرض فقط"} — ${plan.provider}`,
      });
      return r;
    });

    const applied = results.filter((x) => x.ok).length;
    return json({
      ok: applied > 0 || results.length === 0,
      reply: summarize(plan.reply, results, shouldApply),
      actions: plan.actions,
      results,
      applied,
      provider: plan.provider,
    });
  } catch (e) {
    return bad(safeDetail(e), 500);
  }
}
