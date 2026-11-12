/**
 * Dz connect ai — server-only AI provider adapter.
 *
 * Keys come from environment variables (never shipped to the browser):
 *   AI_API_KEY     preferred generic key
 *   AI_PROVIDER    gemini | groq | openrouter (auto-detected when omitted)
 *   AI_MODEL       optional model override
 * Legacy fallbacks used by earlier projects: GEMINI_API_KEY, GOOGLE_API_KEY,
 * GROQ_API_KEY, OPENROUTER_API_KEY.
 *
 * The legacy Google/Gemini key from the older Nexus project family is wired
 * in via AI_API_KEY in .env.local (local) and Vercel env vars (production).
 */

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

type Provider = "gemini" | "groq" | "openrouter";

const clean = (v?: string) => (v ?? "").trim();

function resolveKey(provider: Provider): string {
  const generic = clean(process.env.AI_API_KEY);
  if (generic) return generic;
  if (provider === "gemini") return clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY);
  if (provider === "groq") return clean(process.env.GROQ_API_KEY);
  return clean(process.env.OPENROUTER_API_KEY);
}

export function resolveProvider(): { provider: Provider; key: string; model: string } | null {
  const forced = clean(process.env.AI_PROVIDER).toLowerCase() as Provider | "";
  const generic = clean(process.env.AI_API_KEY);

  let provider: Provider;
  if (forced === "gemini" || forced === "groq" || forced === "openrouter") provider = forced;
  else if (generic.startsWith("gsk_")) provider = "groq";
  else if (generic) provider = "gemini";
  else if (clean(process.env.GROQ_API_KEY)) provider = "groq";
  else if (clean(process.env.OPENROUTER_API_KEY)) provider = "openrouter";
  else provider = "gemini";

  const key = resolveKey(provider);
  if (!key) return null;

  const model =
    clean(process.env.AI_MODEL) ||
    (provider === "gemini" ? "gemini-2.5-flash" : provider === "groq" ? "llama-3.3-70b-versatile" : "openai/gpt-4o-mini");
  return { provider, key, model };
}

export function aiConfigured(): boolean {
  return resolveProvider() !== null;
}

/** Cheap upstream probe (lists models) — used by /api/ai/status. */
export async function probeAi(): Promise<{ configured: boolean; ok: boolean; provider: string | null; detail?: string }> {
  const resolved = resolveProvider();
  if (!resolved) return { configured: false, ok: false, provider: null };
  const { provider, key } = resolved;
  try {
    const res =
      provider === "gemini"
        ? await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
            headers: { "x-goog-api-key": key },
            signal: AbortSignal.timeout(8000),
          })
        : await fetch(provider === "groq" ? "https://api.groq.com/openai/v1/models" : "https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(8000),
          });
    if (res.ok) return { configured: true, ok: true, provider };
    const text = await res.text().catch(() => "");
    return { configured: true, ok: false, provider, detail: text.slice(0, 160) };
  } catch (err) {
    return { configured: true, ok: false, provider, detail: err instanceof Error ? err.message : "network error" };
  }
}

const OPENAI_COMPAT: Record<"groq" | "openrouter", string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

/** Run one chat completion. Throws Error with a user-safe Arabic message on failure. */
export async function runAiChat(system: string, messages: AiMessage[]): Promise<string> {
  const resolved = resolveProvider();
  if (!resolved) throw new Error("المساعد الذكي غير مفعّل بعد على الخادم.");
  const { provider, key, model } = resolved;

  try {
    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            })),
            generationConfig: { maxOutputTokens: 1200, temperature: 0.85 },
          }),
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!res.ok) throw new Error(await upstreamMessage(res));
      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim();
      if (!text) throw new Error("لم يصلني ردّ من النموذج — حاول مجددًا.");
      return text;
    }

    const res = await fetch(OPENAI_COMPAT[provider], {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.85,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(await upstreamMessage(res));
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("لم يصلني ردّ من النموذج — حاول مجددًا.");
    return text;
  } catch (err) {
    if (err instanceof Error && /[\u0600-\u06FF]/.test(err.message)) throw err;
    throw new Error("حدثت مشكلة في الاتصال بالذكاء الاصطناعي — حاول بعد لحظات.");
  }
}

async function upstreamMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (res.status === 400 && /API_KEY_INVALID|key not valid/i.test(body)) return "مفتاح الذكاء الاصطناعي غير صالح — يحتاج تحديثًا في إعدادات الخادم.";
  if (res.status === 401 || res.status === 403) return "مفتاح الذكاء الاصطناعي مرفوض من المزوّد — يحتاج تحديثًا في إعدادات الخادم.";
  if (res.status === 429) return "المساعد مشغول الآن (حدّ الطلبات) — انتظر ثواني وحاول مجددًا.";
  return "تعذّر الوصول إلى خدمة الذكاء الاصطناعي — حاول بعد لحظات.";
}
