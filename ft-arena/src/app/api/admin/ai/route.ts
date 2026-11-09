/** 🧠 واجهة الكونسول الذكي (HTTP) — المنطق في src/lib/ai-brain.ts */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate, readFresh, lastPersist } from "@/lib/store";
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


/**
 * لا نثق بـ "ok" من المنفّذ: نقرأ الوثيقة من التخزين الدائم بعد الكتابة ونقارنها.
 * إن لم يتغيّر شيء أو لم تُحفظ الكتابة → نقولها بصراحة.
 */
async function verifyApplied(
  beforeJson: string,
  snapshot: (d: Awaited<ReturnType<typeof loadDB>>) => string,
  results: { name: string; ok: boolean; detail?: string }[]
): Promise<{ stored: boolean; changed: boolean; reply?: string }> {
  const fresh = await readFresh();
  const persist = lastPersist();
  const stored = fresh ? snapshot(fresh) !== beforeJson : Boolean(persist?.ok);
  const changed = fresh ? snapshot(fresh) !== beforeJson : false;
  const okCount = results.filter((r) => r.ok).length;

  if (okCount > 0 && fresh && !changed) {
    return {
      stored: false,
      changed: false,
      reply: [
        "⚠️ لم يُطبَّق أي تغيير فعلي في البوت — التخزين لم يعكس التعديل.",
        "العمليات المطلوبة:",
        ...results.map((r) => `• ${r.name} — ${r.detail ?? ""}`),
        "",
        `🔧 التخزين: ${persist?.mode ?? "غير معروف"}${persist && !persist.ok ? " (فشل الحفظ)" : ""}`,
      ].join("\n"),
    };
  }
  if (okCount > 0 && !fresh && persist && !persist.ok) {
    return {
      stored: false,
      changed: false,
      reply: "⚠️ نُفِّذت العملية في الذاكرة فقط ولم تُحفظ في التخزين الدائم — لم تصل إلى البوت.",
    };
  }
  if (okCount > 0 && changed) {
    // نضيف سطر إثبات للرد
    const base = summarize("", results, true);
    return { stored, changed, reply: `${base}\n\n<i>✔️ تم التحقق من التغيير في قاعدة البوت الفعلية.</i>` };
  }
  return { stored: true, changed };
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

    // نسخة «قبل» للتحقق الفعلي: نكتب ثم نقرأ من Redis مباشرة ونقارن
    const before = await loadDB();
    const snapshot = (d: typeof before) =>
      JSON.stringify({
        rewards: d.rewards.map((x) => `${x.title}:${x.cost}`),
        tasks: d.tasks.map((x) => `${x.title}:${x.points}`),
        contests: d.contests.map((x) => `${x.title}:${x.prize}`),
        points: d.settings.points,
        features: d.settings.features,
        bot: [d.settings.botName, d.settings.maintenance, d.settings.botEnabled],
        texts: d.settings.texts,
        wheel: d.wheel.length,
        extraJoins: d.settings.extraJoins ?? [],
        forceJoin: d.settings.forceJoin,
        users: Object.values(d.users)
          .slice(0, 300)
          .map((u) => `${u.id}:${u.points}:${u.banned ? 1 : 0}:${u.vip ? 1 : 0}`),
      });
    const beforeJson = snapshot(before);

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

    // ✅ تحقّق فعلي: نقرأ من Redis مباشرة (بعد الكتابة) ونقارن الوثيقة
    const verified = await verifyApplied(beforeJson, snapshot, results);

    const applied = results.filter((x) => x.ok).length;
    const failed = results.filter((x) => !x.ok).length;

    /**
     * ok يعني: «تمّت معالجة الطلب بنجاح» — وليس «تغيّرت قاعدة البيانات».
     * كان ok=false عندما لا تتغيّر أي حقل (سؤال، عرض توضيحي، طلب لا يحتاج تعديلًا)،
     * فيُظهر العميل خطأً أحمر لطلبٍ ناجح تمامًا. الفشل الحقيقي هو:
     *   - التخزين لم يحفظ شيئًا رغم نجاح العمليات، أو
     *   - كل العمليات فشلت.
     */
    const storageBroken = applied > 0 && !verified.stored;
    const allFailed = results.length > 0 && applied === 0;
    const ok = !storageBroken && !allFailed;

    const reply = verified.reply ?? summarize(plan.reply, results, shouldApply);
    return json({
      ok,
      reply,
      actions: plan.actions,
      results,
      applied,
      failed,
      changed: verified.changed,
      provider: plan.provider,
      error: ok ? undefined : reply,
      verified: { stored: verified.stored, changed: verified.changed, persist: lastPersist() },
    });
  } catch (e) {
    return bad(safeDetail(e), 500);
  }
}
