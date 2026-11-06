import { config } from "dotenv";
config({ path: ".env.local", quiet: true }); config({ quiet: true });
async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { console.error(JSON.stringify({ event: "ai_check_failed", reason: "missing_key" })); process.exitCode = 1; return; }
  const model = process.env.GEMINI_FLASH_MODEL || "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with JSON: {\"ok\":true}" }] }], generationConfig: { temperature: 0, maxOutputTokens: 64, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } } }),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => null) as { error?: { message?: string; status?: string }; candidates?: unknown[] } | null;
  if (!response.ok) { console.error(JSON.stringify({ event: "ai_check_failed", httpStatus: response.status, providerStatus: body?.error?.status, providerMessage: body?.error?.message?.slice(0, 300) })); process.exitCode = 1; return; }
  console.log(JSON.stringify({ event: "ai_check", ok: Boolean(body?.candidates?.length), model }));
}
main().catch((error) => { console.error(JSON.stringify({ event: "ai_check_failed", name: error instanceof Error ? error.name : "UnknownError" })); process.exitCode = 1; });
