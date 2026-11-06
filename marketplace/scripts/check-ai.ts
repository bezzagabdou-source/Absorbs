import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
import { assist } from "../src/features/ai/service";
async function probe(name: string, run: () => Promise<Response>) {
  try {
    const response = await run();
    const body = await response.json().catch(() => null) as { error?: { message?: string; status?: string }; candidates?: unknown[]; choices?: unknown[] } | null;
    console.log(JSON.stringify({ event: `${name}_probe`, ok: response.ok, httpStatus: response.status, providerStatus: body?.error?.status, providerMessage: body?.error?.message?.slice(0, 300), hasOutput: Boolean(body?.candidates?.length || body?.choices?.length) }));
  } catch (error) { console.log(JSON.stringify({ event: `${name}_probe`, ok: false, name: error instanceof Error ? error.name : "UnknownError" })); }
}
async function main() {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_FLASH_MODEL || "gemini-3.8-flash";
    await probe("gemini", () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: 'Reply with JSON: {"ok":true}' }] }], generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: "application/json" } }), signal: AbortSignal.timeout(15000) }));
  }
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
    await probe("openrouter", () => fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${openRouterKey}`, "X-Title": "DZ Exchange" }, body: JSON.stringify({ model, temperature: 0, max_tokens: 64, response_format: { type: "json_object" }, messages: [{ role: "user", content: 'Reply with JSON: {"ok":true}' }] }), signal: AbortSignal.timeout(30000) }));
  }
  const result = await assist({ mode: "safety", prompt: "A stranger asks for an advance payment before meeting. What should I do?", locale: "en" });
  console.log(JSON.stringify({ event: "ai_check", ok: Boolean(result.advice), keywords: result.keywords.length }));
}
main().catch((error) => { console.error(JSON.stringify({ event: "ai_check_failed", name: error instanceof Error ? error.name : "UnknownError", code: (error as { code?: string }).code })); process.exitCode = 1; });
