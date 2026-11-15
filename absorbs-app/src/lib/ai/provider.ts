/**
 * Dz connect ai — server-only AI adapter with an AUTOMATIC FALLBACK CHAIN.
 *
 * Keys come from environment variables (never shipped to the browser):
 *   AI_API_KEY     generic key (Gemini-style "AIza…"/"AQ.…", Groq "gsk_…" or OpenRouter "sk-or-…")
 *   AI_PROVIDER    optional forced provider: gemini | groq | openrouter
 *   AI_MODEL       optional model override (applies to the primary provider only)
 *   GEMINI_API_KEY / GOOGLE_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY — direct provider keys
 *
 * How it works (this is what makes the AI work ~100% of the time):
 *   1. Build an ordered list of every configured provider candidate.
 *   2. Try them one by one until one answers — a broken/expired key can no longer
 *      take the assistant down as long as ANY valid key exists on the server.
 *   3. /api/ai/status reports the first candidate that actually answers.
 */

export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}

type Provider = "gemini" | "groq" | "openrouter";

interface Candidate {
  provider: Provider;
  key: string;
  model: string;
  label: string;
}

const clean = (v?: string) => (v ?? "").trim();

const DEFAULT_MODEL: Record<Provider, string> = {
  gemini: "gemini-2.5-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "openai/gpt-4o-mini",
};

function detectProviderFromKey(key: string): Provider {
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("sk-or")) return "openrouter";
  return "gemini";
}

/** Ordered candidates: forced provider first, then the generic key, then every direct key. */
export function aiCandidates(): Candidate[] {
  const generic = clean(process.env.AI_API_KEY);
  const forced = clean(process.env.AI_PROVIDER).toLowerCase();
  const geminiKey = clean(process.env.GEMINI_API_KEY) || clean(process.env.GOOGLE_API_KEY);
  const groqKey = clean(process.env.GROQ_API_KEY);
  const openrouterKey = clean(process.env.OPENROUTER_API_KEY);
  const modelOverride = clean(process.env.AI_MODEL);

  const list: Candidate[] = [];
  const seen = new Set<string>();
  const push = (provider: Provider, key: string, primary = false) => {
    if (!key) return;
    const dedupe = `${provider}:${key}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    list.push({
      provider,
      key,
      model: primary && modelOverride ? modelOverride : DEFAULT_MODEL[provider],
      label: provider,
    });
  };

  // 1) explicitly forced provider wins (with the generic key), 2) gemini model override only for it
  if (forced === "gemini" || forced === "groq" || forced === "openrouter") {
    push(forced, generic, true);
  }
  // 2) generic key without a forced provider — detect from its prefix
  if (generic && !forced) push(detectProviderFromKey(generic), generic, true);
  // 3) direct provider keys, in reliability order
  push("gemini", geminiKey);
  push("groq", groqKey);
  push("openrouter", openrouterKey);
  // 4) as a last resort, the generic key on every remaining provider family
  if (generic) {
    push("gemini", generic, forced === "gemini");
    push("groq", generic, forced === "groq");
    push("openrouter", generic, forced === "openrouter");
  }
  return list;
}

export function resolveProvider(): { provider: Provider; key: string; model: string } | null {
  const first = aiCandidates()[0];
  return first ? { provider: first.provider, key: first.key, model: first.model } : null;
}

export function aiConfigured(): boolean {
  return aiCandidates().length > 0;
}

/** Cheap upstream probe (lists models) for ONE candidate. */
async function probeOne(c: Candidate): Promise<{ ok: boolean; detail?: string }> {
  try {
    const res =
      c.provider === "gemini"
        ? await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", {
            headers: { "x-goog-api-key": c.key },
            signal: AbortSignal.timeout(8000),
          })
        : await fetch(c.provider === "groq" ? "https://api.groq.com/openai/v1/models" : "https://openrouter.ai/api/v1/models", {
            headers: { Authorization: `Bearer ${c.key}` },
            signal: AbortSignal.timeout(8000),
          });
    if (res.ok) return { ok: true };
    const text = await res.text().catch(() => "");
    return { ok: false, detail: `HTTP ${res.status} ${text.slice(0, 120)}`.trim() };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : "network error" };
  }
}

export interface AiProbeReport {
  configured: boolean;
  ok: boolean;
  provider: string | null;
  detail?: string;
  /** Per-candidate results — handy for /api/ai/status debugging (no keys, just booleans). */
  attempts: Array<{ provider: string; ok: boolean; detail?: string }>;
}

/** Probe the whole chain — ok:true as soon as ONE provider answers. */
export async function probeAi(): Promise<AiProbeReport> {
  const candidates = aiCandidates();
  if (candidates.length === 0) return { configured: false, ok: false, provider: null, attempts: [] };
  const attempts: AiProbeReport["attempts"] = [];
  let firstFailDetail: string | undefined;
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop -- intentional sequential fallback
    const result = await probeOne(candidate);
    attempts.push({ provider: candidate.provider, ok: result.ok, ...(result.detail ? { detail: result.detail } : {}) });
    if (result.ok) {
      return { configured: true, ok: true, provider: candidate.provider, attempts };
    }
    if (!firstFailDetail) firstFailDetail = result.detail;
  }
  return { configured: true, ok: false, provider: attempts[0]?.provider ?? null, detail: firstFailDetail, attempts };
}

const OPENAI_COMPAT: Record<"groq" | "openrouter", string> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
};

async function callOne(candidate: Candidate, system: string, messages: AiMessage[]): Promise<string> {
  const { provider, key, model } = candidate;

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
          generationConfig: { maxOutputTokens: 1400, temperature: 0.85 },
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
      max_tokens: 1400,
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
}

/** Run one chat completion across the whole fallback chain. Arabic, user-safe errors only. */
export async function runAiChat(system: string, messages: AiMessage[]): Promise<string> {
  const candidates = aiCandidates();
  if (candidates.length === 0) throw new Error("المساعد الذكي غير مفعّل بعد على الخادم.");

  let lastError: Error | null = null;
  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line no-await-in-loop -- sequential fallback is the whole point
      return await callOne(candidate, system, messages);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Arabic rate-limit/credential errors are worth surfacing; keep trying the rest first.
      console.error(`[ai] candidate ${candidate.label}/${candidate.model} failed:`, lastError.message);
      continue;
    }
  }

  if (lastError && /[\u0600-\u06FF]/.test(lastError.message) && /حدّ الطلبات/.test(lastError.message)) {
    throw lastError;
  }
  throw new Error("المساعد الذكي لا يستجيب حاليًا على أي مسار — حاول بعد لحظات.");
}

async function upstreamMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  if (res.status === 400 && /API_KEY_INVALID|key not valid/i.test(body)) return "مفتاح الذكاء الاصطناعي غير صالح — يحتاج تحديثًا في إعدادات الخادم.";
  if (res.status === 401 || res.status === 403) return "مفتاح الذكاء الاصطناعي مرفوض من المزوّد — يحتاج تحديثًا في إعدادات الخادم.";
  if (res.status === 429) return "المساعد مشغول الآن (حدّ الطلبات) — انتظر ثواني وحاول مجددًا.";
  return "تعذّر الوصول إلى خدمة الذكاء الاصطناعي — حاول بعد لحظات.";
}
