import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile } from "@/lib/usage";
import { streamGemini, GeminiError } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const PATCH_SYSTEM = `You are the precision-patch engine of Nexus AI v8.4 Pro. The user clicked ONE element in a live web page and asked for a change to it. Return ONLY one JSON object, no prose and no code fence:
{"html": string, "css": string}
- "html": the COMPLETE replacement outerHTML of that same element (same tag, same id, same data-component, same class names unless the change needs new ones, same event attributes and child ids so the page's existing JavaScript keeps working). Change only what the user asked.
- "css": optional extra CSS rules needed by the change (new classes you added, hover/focus states, @keyframes). Use the project's CSS variables / palette from PROJECT RULES when they exist. Empty string if inline styles are enough.
- Never output <script> tags, @import or remote URLs. Keep the user's language and RTL/LTR direction.
- Never touch anything outside this element.`;

async function readAll(stream: ReadableStream<string>): Promise<string> {
  const r = stream.getReader();
  let out = "";
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    out += value;
  }
  return out;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`patch:${user.uid}`, 20, 60_000).ok) return json(429, { code: "RATE" }, { "Retry-After": "15" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const instruction = str(body.instruction, 1200).trim();
  const element = str(body.element, 12_000);
  if (instruction.length < 2 || element.length < 3) return json(400, { code: "BAD_REQUEST" });

  let pro = false;
  try {
    pro = (await getProfile(user.uid))?.plan === "pro";
  } catch {
    pro = false;
  }
  if (!pro) return json(403, { code: "PRO_ONLY" });

  const prompt = [
    `PROJECT RULES:\n${str(body.rules, 3000) || "(none)"}`,
    `COMPONENT: ${str(body.component, 60) || "(untagged)"}`,
    `SELECTED ELEMENT:\n${element}`,
    `USER REQUEST: ${instruction}`,
  ].join("\n\n");

  try {
    const stream = await streamGemini({
      system: PATCH_SYSTEM,
      messages: [{ role: "user", text: prompt }],
      tier: "pro",
      primaryFirst: true,
      mode: "speed",
      lowThink: true,
      task: "code",
      temperature: 0.4,
      maxTokens: 8000,
    });
    const text = await readAll(stream);
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a < 0 || b <= a) return json(502, { code: "BAD_OUTPUT" });
    const o = JSON.parse(text.slice(a, b + 1)) as { html?: unknown; css?: unknown };
    let html = typeof o.html === "string" ? o.html : "";
    let css = typeof o.css === "string" ? o.css : "";
    html = html.replace(/<script\b[\s\S]*?<\/script>/gi, "").trim();
    css = css.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*['"]?\s*(?:https?:)?\/\//gi, "url(about:blank#").trim();
    if (!html.startsWith("<")) return json(502, { code: "BAD_OUTPUT" });
    return json(200, { html, css });
  } catch (e) {
    console.error("[patch] failed:", e);
    return json(502, { code: e instanceof GeminiError ? e.code : "ERROR" });
  }
}
