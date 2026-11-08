/** 🧠 واجهة الكونسول الذكي (HTTP) — المنطق في src/lib/ai-brain.ts */
import { guard, json, bad, safeDetail } from "@/lib/api";
import { loadDB, logActivity, mutate } from "@/lib/store";
import { planPrompt, runActions } from "@/lib/ai-brain";
import { detectAIProviders } from "@/lib/env";

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
      db.logs.unshift({
        at: new Date().toISOString(),
        prompt,
        reply: plan.reply,
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

    return json({ ok: true, reply: plan.reply, actions: plan.actions, results, provider: plan.provider });
  } catch (e) {
    return bad(safeDetail(e), 500);
  }
}
