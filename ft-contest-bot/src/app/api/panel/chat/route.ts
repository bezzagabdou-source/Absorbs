import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

// Only the authenticated panel may use the bot's existing AI keys. This endpoint
// never executes tools and never accepts a provider URL or credentials from callers.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(req.headers.get("x-panel-key") || "");
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}
const reply = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
function model(name: string, fallback: string): string {
  const value = (process.env[name] || "").trim();
  return /^[a-zA-Z0-9_./:-]{1,150}$/.test(value) ? value : fallback;
}
function firstKey(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] || "").split(/[,;\s]+/).find(Boolean);
    if (value) return value;
  }
  return "";
}
function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return reply({ ok: false, error: "unauthorized" }, 401);
  if (Number(request.headers.get("content-length") || 0) > 900_000) return reply({ ok: false, error: "request too large" }, 413);
  const input = await request.json().catch(() => null);
  if (!isObject(input) || !Array.isArray(input.messages) || !Array.isArray(input.tools) ||
      !input.messages.length || input.messages.length > 350 || input.tools.length > 100 ||
      JSON.stringify(input).length > 900_000 ||
      input.messages.some((m: unknown) => !isObject(m) || !["system", "user", "assistant", "tool"].includes(String(m.role)) || !(m.content === null || typeof m.content === "string")) ||
      input.tools.some((t: unknown) => !isObject(t) || t.type !== "function" || !isObject(t.function) || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(String(t.function.name)))) {
    return reply({ ok: false, error: "invalid request" }, 400);
  }

  const candidates: { url: string; key: string; model: string }[] = [];
  const gemini = firstKey("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY");
  const router = firstKey("OPENROUTER_API_KEY");
  if (gemini) candidates.push({ url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", key: gemini, model: model("PANEL_GEMINI_MODEL", "gemini-flash-latest") });
  if (router) candidates.push({ url: "https://openrouter.ai/api/v1/chat/completions", key: router, model: model("PANEL_OPENROUTER_MODEL", "openrouter/free") });
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url, {
        method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
        headers: { "content-type": "application/json", authorization: `Bearer ${candidate.key}` },
        body: JSON.stringify({ model: candidate.model, messages: input.messages, tools: input.tools, tool_choice: "auto", temperature: 0.1, max_tokens: Math.max(1024, Math.min(8192, Number(process.env.PANEL_MAX_OUTPUT_TOKENS) || 8192)) }),
      });
      if (!response.ok) continue;
      const payload = await response.json().catch(() => ({})) as { choices?: { message?: unknown }[] };
      const message = payload.choices?.[0]?.message;
      if (!isObject(message)) continue;
      const content = typeof message.content === "string" ? message.content.trim().slice(0, 40000) : "";
      const calls = Array.isArray(message.tool_calls) ? message.tool_calls.slice(0, 12).flatMap((c: unknown) => {
        if (!isObject(c) || !isObject(c.function) || !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(String(c.function.name)) || typeof c.function.arguments !== "string" || c.function.arguments.length > 300000) return [];
        return [{ id: typeof c.id === "string" && c.id.length <= 200 ? c.id : crypto.randomUUID(), type: "function", function: { name: c.function.name, arguments: c.function.arguments } }];
      }) : [];
      if (content || calls.length) return reply({ ok: true, message: { role: "assistant", content: content || null, ...(calls.length ? { tool_calls: calls } : {}) } });
    } catch { /* Try the next fixed provider without exposing image data or credentials. */ }
  }
  return reply({ ok: false, error: "المساعد غير متاح مؤقتاً" }, 503);
}
