import { json, safeDetail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile } from "@/lib/usage";
import { streamGemini, streamToResponse, GeminiError } from "@/lib/gemini";
import { PRO_OUTPUT_TOKENS, FREE_OUTPUT_TOKENS } from "@/lib/limits";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Nexus v16 — AUTOFIX
 * The live preview caught a runtime error (or produced a blank page). The user
 * pressed "إصلاح تلقائي": we stream back the COMPLETE repaired file.
 */
const AUTOFIX_SYSTEM = `You are the emergency-repair engine of Nexus AI. A self-contained HTML game/app CRASHED at runtime inside a sandboxed preview. You receive (1) the failing file and (2) the captured runtime error. Return the COMPLETE repaired file.

STRICT REPAIR PROTOCOL:
1. Diagnose the real root cause from the error message and the code — fix THAT, then sweep the whole file for the classic crash patterns and fix every one you find: code running before the DOM exists (wrap bootstrap in DOMContentLoaded or place the script at the end of body), null canvas context, undefined / misspelled ids and variables, event listeners on missing elements, NaN physics (division by zero, unclamped delta-time), missing default cases, external assets (images/fonts/audio/fetch are ALL blocked — remove them), audio contexts started before a user gesture (create/resume inside the first pointer/key event), localStorage without try/catch, infinite loops.
2. Preserve EVERY working feature, screen, asset generator, name and design token. This is a surgical repair, not a rewrite.
3. The repaired file must run with ZERO runtime errors on the first load and draw something beautiful immediately (designed loading / menu screen — never a blank or black page).
4. ZERO external network: everything self-contained (canvas / SVG / CSS art, procedural WebAudio). No fetch/XHR/WebSocket/import from any host except the already-whitelisted https://cdnjs.cloudflare.com or https://cdn.jsdelivr.net pinned scripts.
5. OUTPUT FORMAT: exactly ONE \`\`\`html fenced block containing the whole file, nothing before it and nothing after it.`;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`autofix:${user.uid}`, 6, 300_000).ok) {
    return json(429, { code: "RATE" }, { "Retry-After": "60" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const html = str(body.html, 320_000);
  const error = str(body.error, 2_000);
  if (html.length < 50) return json(400, { code: "BAD_REQUEST" });

  let pro = false;
  try {
    pro = (await getProfile(user.uid))?.plan === "pro";
  } catch {
    pro = false;
  }

  const prompt = [
    `RUNTIME ERROR CAPTURED IN THE PREVIEW:\n${error || "(no message — the page rendered nothing)"}`,
    `THE FAILING FILE:\n\`\`\`html\n${html}\n\`\`\``,
    `Return the complete repaired file now.`,
  ].join("\n\n");

  try {
    const stream = await streamGemini({
      system: AUTOFIX_SYSTEM,
      messages: [{ role: "user", text: prompt }],
      tier: pro ? "pro" : "free",
      task: "code",
      primaryFirst: pro,
      mode: "quality",
      lowThink: true,
      temperature: 0.35,
      maxTokens: pro ? PRO_OUTPUT_TOKENS : Math.min(FREE_OUTPUT_TOKENS, 32000),
    });
    return streamToResponse(stream, { "x-nexus": "autofix-v16" });
  } catch (e) {
    console.error("[autofix] failed:", e);
    if (e instanceof GeminiError) {
      return json(e.code === "NO_KEY" ? 503 : 502, { code: e.code, detail: safeDetail(e.detail) });
    }
    return json(500, { code: "ERROR", detail: safeDetail(e) });
  }
}
