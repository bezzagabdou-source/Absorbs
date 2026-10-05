import { json, safeDetail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { takeCredit, refundCredit, getProfile, chargeStreamTime, FREE_DAILY } from "@/lib/usage";
import { MAX_OUTPUT_TOKENS, PRO_OUTPUT_TOKENS, FREE_OUTPUT_TOKENS } from "@/lib/limits";
import { streamGemini, ensembleStream, continueStream, streamToResponse, GeminiError } from "@/lib/gemini";
import { buildToolPrompt } from "@/lib/prompts";
import { getTool } from "@/lib/tools";
import { db } from "@/db";
import { toolRuns } from "@/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300; // Hobby max. Vercel Pro: you may raise to 800 (then also raise REQUEST_* in lib/limits.ts)

const MAX_FIELD = 5000;
const MAX_FIELD_PRO = 20000; // code snippets are longer than prose
/** Pro tools that deserve the strongest model rather than the fastest. */
const QUALITY_TOOLS = new Set(["security-audit"]);

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: {
    tool?: string;
    inputs?: Record<string, string>;
    outLang?: string;
    locale?: string;
    continueFrom?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const tool = getTool(body.tool ?? "");
  if (!tool) return json(404, { code: "UNKNOWN_TOOL" });

  const inputs: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.inputs ?? {})) {
    if (typeof v === "string")
      inputs[k] = v.slice(0, tool.pro ? MAX_FIELD_PRO : MAX_FIELD).trim();
  }
  for (const f of tool.fields) {
    if (f.required && !inputs[f.key]) {
      return json(400, { code: "MISSING_FIELD", field: f.key });
    }
  }

  // Big builds: the client asks for the missing tail in a fresh request (no extra credit)
  if (typeof body.continueFrom === "string" && body.continueFrom.length > 200 && tool.pro && tool.kind === "game") {
    const prof = await getProfile(user.uid).catch(() => null);
    if (prof?.plan !== "pro") return json(403, { code: "PRO_ONLY" });
    const loc2 = ["ar", "fr", "en"].includes(body.locale ?? "") ? (body.locale as string) : "ar";
    const p2 = buildToolPrompt(tool.id, inputs, loc2, body.outLang ?? "auto");
    return streamToResponse(
      continueStream({ system: p2.system, user: p2.user, partial: body.continueFrom.slice(-160_000) }),
      { "x-plan": "pro" }
    );
  }

  const rl = rateLimit(`ai:${user.uid}`, 30, 60_000);
  if (!rl.ok) {
    return json(
      429,
      { code: "RATE" },
      { "Retry-After": String(rl.retryAfter) }
    );
  }

  const taken = await takeCredit(user);
  if (taken && !taken.ok) return json(429, { code: "QUOTA" });
  const credit = taken ?? {
    ok: true as const,
    remaining: FREE_DAILY,
    plan: "free" as const,
    tracked: false,
  };

  const isPro = credit.plan === "pro";

  // Pro-only tools (code analysis, game builder): the server is the real gate
  if (tool.pro && !isPro) {
    if (credit.tracked) await refundCredit(user.uid);
    return json(403, { code: "PRO_ONLY" });
  }
  // free accounts keep the original 15 requests / minute
  if (!isPro && !rateLimit(`aif:${user.uid}`, 15, 60_000).ok) {
    if (credit.tracked) await refundCredit(user.uid);
    return json(429, { code: "RATE" }, { "Retry-After": "30" });
  }

  const locale = ["ar", "fr", "en"].includes(body.locale ?? "")
    ? (body.locale as string)
    : "ar";
  const prompt = buildToolPrompt(tool.id, inputs, locale, body.outLang ?? "auto");

  const summary = JSON.stringify({ tool: tool.id, inputs }).slice(0, 4000);
  const titleSeed =
    tool.fields
      .filter((f) => f.required)
      .map((f) => inputs[f.key])
      .filter(Boolean)
      .join(" · ")
      .slice(0, 80) || tool.id;

  let usedModel = "";
  try {
    const startedAt = Date.now();
    const saveRun = async (full: string) => {
      if (!isPro && credit.tracked) void chargeStreamTime(user.uid, Date.now() - startedAt);
      const text = full.trim();
      if (!text) return;
      await db
        .insert(toolRuns)
        .values({
          userId: user.uid,
          tool: tool.id,
          title: titleSeed,
          input: summary,
          output: text,
        })
        .catch(() => undefined);
    };
    // the game builder uses the whole AI team (Gemini + Grok + OpenRouter + Groq)
    const stream =
      isPro && (tool.id === "game-builder" || tool.kind === "game" || tool.id === "landing-builder" || tool.id === "ui-designer")
        ? ensembleStream({
            system: prompt.system,
            messages: [{ role: "user", text: prompt.user }],
            temperature: 0.7,
            epic: true,
            segment: 16000,
            ...(tool.id === "landing-builder" || tool.id === "ui-designer" ? { kind: "build" as const, site: true } : {}),
            onModel: (m) => {
              usedModel = m;
            },
            onDone: saveRun,
            onFail: async () => {
              if (credit.tracked) await refundCredit(user.uid);
            },
          })
        : await streamGemini({
            system: prompt.system,
            messages: [{ role: "user", text: prompt.user }],
            temperature: tool.pro ? 0.5 : 0.8,
            tier: isPro ? "pro" : "free",
            mode: isPro && QUALITY_TOOLS.has(tool.id) ? "quality" : "speed",
            maxTokens: (tool.id === "game-builder" || tool.kind === "game") ? MAX_OUTPUT_TOKENS : tool.pro ? PRO_OUTPUT_TOKENS : FREE_OUTPUT_TOKENS,
            onModel: (m) => {
              usedModel = m;
            },
            onDone: saveRun,
          });

    return streamToResponse(stream, {
      "x-credits-remaining": String(credit.remaining),
      "x-plan": credit.plan,
      ...(isPro ? { "x-model": usedModel } : {}),
    });
  } catch (e) {
    if (credit.tracked) await refundCredit(user.uid);
    console.error("[tool] gemini failed:", e);
    if (e instanceof GeminiError) {
      return json(e.code === "NO_KEY" ? 503 : e.code === "BUSY" ? 503 : 500, {
        code: e.code,
        detail: safeDetail(e.detail),
      });
    }
    return json(500, { code: "ERROR", detail: safeDetail(e) });
  }
}
