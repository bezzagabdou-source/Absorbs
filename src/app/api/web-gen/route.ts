import { NextRequest } from "next/server";
import { composeHtml } from "@/lib/engine";
import { AIProviderError, generateAIResponseSafe } from "@/lib/ai-providers";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { json, safeDetail } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SYSTEM = `You are Nexus Web, an elite front-end generator.
Return ONLY one complete HTML document inside a single \`\`\`html fenced code block. Nothing outside the block.
Hard requirements:
- Single self-contained file. Tailwind via <script src="https://cdn.tailwindcss.com">.
- lang="ar" dir="rtl", IBM Plex Sans Arabic via Google Fonts, dark elegant design.
- Fully responsive, real working placeholder content written in Arabic that matches the user's request (site name, sections, numbers, products…).
- Smooth hover transitions, a sticky header, a hero, content sections, a CTA and a footer.
- No frameworks, no external JS other than the Tailwind CDN.`;

function extractHtml(text: string): string | null {
  const fenced = /```(?:html|XML|xml)?\s*\n([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.search(/<!DOCTYPE html|<html/i);
  if (start === -1) return null;
  return candidate.slice(start).trim();
}

/**
 * POST /api/web-gen { prompt }
 * Generates a real single-file HTML page. With provider keys: a real LLM
 * (code task chain). Without: the built-in deterministic template engine.
 */
export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const rl = rateLimit(`webgen:${user.uid}`, 10, 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });

  const body = (await req.json().catch(() => ({}))) as { prompt?: unknown };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return json(400, { code: "PROMPT_REQUIRED" });

  try {
    const r = await generateAIResponseSafe("code", prompt, {
      system: SYSTEM,
      maxTokens: 16000,
      timeoutMs: 90_000,
    });
    if (r.ok) {
      const html = extractHtml(r.text);
      if (html) return json(200, { ok: true, html, engine: `${r.provider}/${r.model}` });
      // the model answered but without an HTML document → local template as safety net
      const localHtml = composeHtml(prompt);
      return json(200, { ok: true, html: localHtml, engine: "nexus-local" });
    }
    if (r.code === "NO_KEY" || r.code === "ALL_FAILED") {
      // no keys (or all engines down) → deterministic local template, still a real page
      return json(200, { ok: true, html: composeHtml(prompt), engine: "nexus-local" });
    }
    console.error("[web-gen]", r);
    return json(502, { code: "AI", detail: safeDetail(r.error) });
  } catch (e) {
    console.error("[web-gen]", e);
    return json(500, { code: "ERROR", detail: safeDetail(e) });
  }
}
