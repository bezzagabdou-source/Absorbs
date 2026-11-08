/**
 * فحص حقيقي لمزوّدي الذكاء الاصطناعي (لا يكشف أي مفتاح).
 * محميّ بسرّ الـ webhook: /api/admin/ai/ping?key=<WEBHOOK_SECRET>
 */
import { env } from "@/lib/env";
import { loadDB } from "@/lib/store";
import { planPrompt } from "@/lib/ai-brain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!key || key !== env.webhookSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const db = await loadDB();
  const saved = Boolean((db.settings.ai?.apiKey ?? "").trim());

  // فحص الاتصال الفعلي بكل مزوّد مُهيّأ
  const checks: { name: string; key: string; url: string; model: string; kind: "openai" | "gemini" }[] = [
    {
      name: "groq",
      key: (process.env.GROQ_API_KEY ?? "").trim(),
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: (process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile").trim(),
      kind: "openai",
    },
    {
      name: "cerebras",
      key: (process.env.CEREBRAS_API_KEY ?? "").trim(),
      url: "https://api.cerebras.ai/v1/chat/completions",
      model: (process.env.CEREBRAS_MODEL ?? "gpt-oss-120b").trim(),
      kind: "openai",
    },
    {
      name: "openrouter",
      key: (process.env.OPENROUTER_API_KEY ?? "").trim(),
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: (process.env.OPENROUTER_MODEL ?? "google/gemini-2.0-flash-001").trim(),
      kind: "openai",
    },
    {
      name: "openai",
      key: (process.env.OPENAI_API_KEY ?? "").trim(),
      url: "https://api.openai.com/v1/chat/completions",
      model: (process.env.OPENAI_MODEL ?? "gpt-4o-mini").trim(),
      kind: "openai",
    },
    {
      name: "gemini",
      key: (process.env.GEMINI_API_KEY ?? "").trim(),
      url: "https://generativelanguage.googleapis.com/v1beta/models",
      model: (process.env.AI_MODEL ?? "gemini-2.5-flash").trim(),
      kind: "gemini",
    },
  ];

  const results = await Promise.all(
    checks
      .filter((c) => c.key)
      .map(async (c) => {
        const t0 = Date.now();
        try {
          const ctl = new AbortController();
          const timer = setTimeout(() => ctl.abort(), 12000);
          const res =
            c.kind === "openai"
              ? await fetch(c.url, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
                  body: JSON.stringify({
                    model: c.model,
                    max_tokens: 20,
                    messages: [{ role: "user", content: "قل: تم" }],
                  }),
                  cache: "no-store",
                  signal: ctl.signal,
                })
              : await fetch(`${c.url}/${c.model}:generateContent?key=${encodeURIComponent(c.key)}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "قل: تم" }] }] }),
                  cache: "no-store",
                  signal: ctl.signal,
                });
          clearTimeout(timer);
          const body = await res.text();
          let err = "";
          try {
            const j = JSON.parse(body) as { error?: { message?: string } };
            if (j.error?.message) err = j.error.message.slice(0, 160);
          } catch {
            /* ليس JSON */
          }
          return {
            name: c.name,
            ok: res.ok,
            status: res.status,
            ms: Date.now() - t0,
            model: c.model,
            error: res.ok ? null : err || body.slice(0, 120),
          };
        } catch (e) {
          return {
            name: c.name,
            ok: false,
            status: 0,
            ms: Date.now() - t0,
            model: c.model,
            error: (e as Error).message.slice(0, 160),
          };
        }
      })
  );

  // اختبار سلسلة موديلات Groq الفعلية (نفس ما يستخدمه البوت)
  const chain = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "allam-2-7b"];
  const groqKey2 = (process.env.GROQ_API_KEY ?? "").trim();
  const groqTries = groqKey2
    ? await Promise.all(
        chain.map(async (m) => {
          const t0 = Date.now();
          try {
            const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey2}` },
              body: JSON.stringify({
                model: m,
                max_tokens: 30,
                temperature: 0.2,
                response_format: { type: "json_object" },
                messages: [
                  { role: "system", content: 'أعد JSON فقط: {"reply":"تم","actions":[]}' },
                  { role: "user", content: "قل تم" },
                ],
              }),
              cache: "no-store",
            });
            const body = await r.text();
            let sample = "";
            try {
              const j = JSON.parse(body) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
              sample = j.choices?.[0]?.message?.content?.slice(0, 60) ?? (j.error?.message ?? "").slice(0, 120);
            } catch {
              sample = body.slice(0, 100);
            }
            return { model: m, ok: r.ok, status: r.status, ms: Date.now() - t0, sample };
          } catch (e) {
            return { model: m, ok: false, status: 0, ms: Date.now() - t0, sample: (e as Error).message.slice(0, 120) };
          }
        })
      )
    : [];

  // اختبار المحرّك: طلب بسيط + طلب معقّد (بلا تنفيذ — للقراءة فقط)
  const probe = async (q: string) => {
    const t = Date.now();
    try {
      const plan = await planPrompt(db, q);
      return {
        q,
        ok: plan.actions.length > 0,
        provider: plan.provider,
        actions: plan.actions.map((a) => a.name),
        reply: plan.reply.slice(0, 160),
        ms: Date.now() - t,
      };
    } catch (e) {
      return { q, ok: false, error: (e as Error).message.slice(0, 200) };
    }
  };

  const engine = await probe("اجعل الهدية اليومية من 2 إلى 4 نقاط");
  const complex = await probe("أضف جائزة PlayStation Plus بسعر 45 نقطة وأخبرني أنك أضفتها");

  // قائمة الموديلات المتاحة فعليًا على مفتاح Groq (لفحص الوصول)
  let groqModels: string[] = [];
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (groqKey) {
    try {
      const r = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${groqKey}` },
        cache: "no-store",
      });
      const j = (await r.json()) as { data?: { id: string }[] };
      groqModels = (j.data ?? []).map((m) => m.id).sort();
    } catch {
      /* تجاهل */
    }
  }

  return Response.json({
    ok: results.some((r) => r.ok) || groqTries.some((r) => r.ok) || engine.ok === true,
    groqModels,
    groqTries,
    savedKeyInDb: saved,
    providers: results,
    engine,
    complex,
    note: results.length === 0 ? "لا يوجد أي مفتاح AI — المحرّك العربي المدمج فقط." : undefined,
  });
}
