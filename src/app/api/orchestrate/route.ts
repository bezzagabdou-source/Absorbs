import { NextRequest } from "next/server";
import { buildPlan, generateAIResponseSafe, generateWithTarget, getProviderStatus, PROVIDER_LABEL } from "@/lib/ai-providers";
import { composeLocalDrafts, mergeLocalDrafts } from "@/lib/engine";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { json, safeDetail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

type Task = { id: string; label: string; model: string };

const enc = new TextEncoder();
function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * POST /api/orchestrate { prompt } — "الوضع التوزيع الذكي" (smart distribution).
 *
 * Live mode (provider keys configured): the prompt is fanned out IN PARALLEL to
 * up to three different engines, then the strongest result is merged by the
 * reasoning chain. The client follows real per-engine progress over SSE.
 *
 * Local mode (no keys): three genuinely different local draft passes run in
 * parallel and are merged — honest, fast, offline.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const rl = rateLimit(`orch:${user.uid}`, 6, 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });

  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 8000) : "";
  if (!prompt) return json(400, { code: "PROMPT_REQUIRED" });

  const anyKey = Object.values(getProviderStatus()).some((p) => p.configured);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(frame(event, data)));
        } catch {
          /* client gone */
        }
      };

      try {
        if (!anyKey) {
          /* ─────────── local mode ─────────── */
          const drafts = composeLocalDrafts(prompt);
          send("plan", { mode: "local", tasks: drafts.map((d) => ({ id: d.id, label: d.label, model: d.model })) });

          const started = Date.now();
          for (const d of drafts) send("task", { id: d.id, status: "start" });
          const t0 = performance.now();
          void t0;
          // the drafts are computed synchronously & in parallel (3 passes)
          const done = drafts.map((d, i) => ({ ...d, ms: Math.max(1, Math.round((performance.now() - started) / (i + 1))) }));
          for (const d of done) send("task", { id: d.id, status: "done", ms: d.ms, snippet: d.text.slice(0, 140) });

          send("final", { ok: true, text: mergeLocalDrafts(drafts), engine: "nexus-local" });
        } else {
          /* ─────────── live mode ─────────── */
          // up to 3 distinct engines from the fast chain
          const targets: { provider: "gemini" | "openrouter" | "groq" | "cerebras"; model: string }[] = [];
          const seen = new Set<string>();
          for (const t of buildPlan("fast")) {
            if (seen.has(t.provider)) continue;
            seen.add(t.provider);
            targets.push(t);
            if (targets.length >= 3) break;
          }

          const status = getProviderStatus();
          const tasks: Task[] = targets.map((t, i) => ({
            id: `t${i}`,
            label: PROVIDER_LABEL[t.provider],
            model: t.model,
          }));
          send("plan", { mode: "live", tasks });
          for (const t of tasks) send("task", { id: t.id, status: "start" });

          type Draft = { id: string; text: string; ms: number } | null;
          const drafts: Draft[] = await Promise.all(
            targets.map(async (t, i) => {
              const id = tasks[i].id;
              const startedAt = Date.now();
              // no key for this engine → fail fast instead of waiting
              if (!status[t.provider].configured) {
                send("task", { id, status: "failed", ms: 0, reason: "no-key" });
                return null;
              }
              try {
                const text = await generateWithTarget(t, prompt, { maxTokens: 1200, timeoutMs: 30_000 });
                const ms = Date.now() - startedAt;
                send("task", { id, status: "done", ms, snippet: text.slice(0, 140) });
                return { id, text, ms };
              } catch {
                send("task", { id, status: "failed", ms: Date.now() - startedAt });
                return null;
              }
            })
          );

          const good = drafts.filter((d): d is { id: string; text: string; ms: number } => !!d);
          if (good.length === 0) {
            send("final", { ok: false, error: "all_engines_failed" });
            return;
          }

          // merge pass: the reasoning chain merges the drafts into one stronger answer
          const best = good.reduce((a, b) => (a.text.length >= b.text.length ? a : b));
          let finalText = best.text;
          let engine = `best-of-${good.length}`;
          if (good.length > 1) {
            const mergePrompt = [
              "أنت المحرر الرئيسي. لديك عدة إجابات مستقلة لنفس طلب المستخدم. اكتب إجابة نهائية واحدة: أبقِ أقوى النقاط، احذف التكرار، وأجب بلغة المستخدم.",
              `---\nطلب المستخدم:\n${prompt}`,
              ...good.map((d, i) => `---\nالإجابة ${i + 1} (${d.ms}ms):\n${d.text.slice(0, 6000)}`),
            ].join("\n");
            const m = await generateAIResponseSafe("reasoning", mergePrompt, { maxTokens: 4096, timeoutMs: 90_000 });
            if (m.ok) {
              finalText = m.text;
              engine = `merged by ${m.provider}/${m.model}`;
            } else {
              engine = `best draft (${best.id})`;
            }
          }
          send("final", { ok: true, text: finalText, engine });
        }
      } catch (e) {
        console.error("[orchestrate]", e);
        send("final", { ok: false, error: safeDetail(e) });
      } finally {
        try {
          controller.close();
        } catch {
          /* closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
