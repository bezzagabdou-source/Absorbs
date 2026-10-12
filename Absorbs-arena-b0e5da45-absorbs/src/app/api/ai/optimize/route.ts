import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { generateAIResponseSafe } from "@/lib/ai-providers";
import { OPTIMIZER_SYSTEM, isOptimizeKind } from "@/lib/prompt-optimizer";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Rewrites a rough request into a precise, structured prompt (video prompts come back in English). */
export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: { text?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2000) : "";
  if (text.length < 3) return json(400, { code: "MISSING_FIELD" });
  const kind = isOptimizeKind(body.kind) ? body.kind : "general";

  const rl = rateLimit(`opt:${user.uid}`, 20, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  const r = await generateAIResponseSafe("fast", text, {
    system: OPTIMIZER_SYSTEM[kind],
    temperature: 0.6,
    maxTokens: 900,
    timeoutMs: 20_000,
  });
  if (!r.ok) return json(502, { code: "FAILED" });
  return json(200, { text: r.text.trim() });
}
