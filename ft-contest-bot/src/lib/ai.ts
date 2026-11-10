/**
 * طبقة ذكاء اصطناعي موحّدة — تشتغل بأي مفتاح متوفّر في البيئة.
 * الأولوية: Gemini ← OpenAI ← Groq ← OpenRouter ← Cerebras ← DeepSeek ← xAI ← Anthropic.
 * لو ما فيه حتى مفتاح، البوت يخدم عادي ويرجّع رسالة مساعدة عادية.
 */

export type AiProvider = {
  id: string;
  label: string;
  model: string;
  kind: "gemini" | "openai" | "anthropic";
  baseUrl?: string;
  key: string;
};

export type AiResult = {
  ok: boolean;
  text: string;
  provider: string;
  model: string;
  error: string;
};

const DEFAULT_MODELS: Record<string, string> = {
  gemini: "gemini-3.8-flash",
  openai: "gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
  openrouter: "google/gemini-2.5-flash",
  cerebras: "gpt-oss-120b",
  deepseek: "deepseek-chat",
  xai: "grok-4-fast",
  anthropic: "claude-sonnet-4-5",
};

/** 🧩 أسماء موديلات Gemini القديمة → الجديدة (2.5 وقف عند Google) */
function normalizeGeminiModel(model: string): string {
  const m = (model || "").trim();
  if (!m) return DEFAULT_MODELS.gemini;
  if (/^gemini-2\.5/i.test(m) || /^models\/gemini-2\.5/i.test(m)) return m.replace(/^models\//, "").replace(/^gemini-2\.5/i, "gemini-3.8");
  return m.replace(/^models\//, "");
}

function env(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim().length > 8) return value.trim();
  }
  return "";
}

/** أول مزوّد متاح حسب المفاتيح الموجودة */
export function aiProvider(overrideModel?: string): AiProvider | null {
  const model = (id: string, ...names: string[]) => env(...names) || DEFAULT_MODELS[id];

  const geminiKey = env("GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY");
  if (geminiKey) {
    return {
      id: "gemini",
      label: "Google Gemini",
      kind: "gemini",
      key: geminiKey,
      model: normalizeGeminiModel(overrideModel || env("AI_MODEL", "GEMINI_FLASH_MODEL") || DEFAULT_MODELS.gemini),
    };
  }

  const openaiKey = env("OPENAI_API_KEY");
  if (openaiKey) {
    return {
      id: "openai",
      label: "OpenAI",
      kind: "openai",
      key: openaiKey,
      baseUrl: "https://api.openai.com/v1",
      model: overrideModel || env("AI_MODEL", "OPENAI_MODEL") || DEFAULT_MODELS.openai,
    };
  }

  const groqKey = env("GROQ_API_KEY");
  if (groqKey) {
    return {
      id: "groq",
      label: "Groq",
      kind: "openai",
      key: groqKey,
      baseUrl: "https://api.groq.com/openai/v1",
      model: overrideModel || env("AI_MODEL", "GROQ_MODEL") || DEFAULT_MODELS.groq,
    };
  }

  const openrouterKey = env("OPENROUTER_API_KEY");
  if (openrouterKey) {
    return {
      id: "openrouter",
      label: "OpenRouter",
      kind: "openai",
      key: openrouterKey,
      baseUrl: "https://openrouter.ai/api/v1",
      model: overrideModel || env("AI_MODEL", "OPENROUTER_MODEL") || DEFAULT_MODELS.openrouter,
    };
  }

  const cerebrasKey = env("CEREBRAS_API_KEY");
  if (cerebrasKey) {
    return {
      id: "cerebras",
      label: "Cerebras",
      kind: "openai",
      key: cerebrasKey,
      baseUrl: "https://api.cerebras.ai/v1",
      model: overrideModel || env("AI_MODEL", "CEREBRAS_MODEL") || DEFAULT_MODELS.cerebras,
    };
  }

  const deepseekKey = env("DEEPSEEK_API_KEY");
  if (deepseekKey) {
    return {
      id: "deepseek",
      label: "DeepSeek",
      kind: "openai",
      key: deepseekKey,
      baseUrl: "https://api.deepseek.com/v1",
      model: overrideModel || env("AI_MODEL", "DEEPSEEK_MODEL") || DEFAULT_MODELS.deepseek,
    };
  }

  const xaiKey = env("XAI_API_KEY", "GROK_API_KEY");
  if (xaiKey) {
    return {
      id: "xai",
      label: "xAI Grok",
      kind: "openai",
      key: xaiKey,
      baseUrl: "https://api.x.ai/v1",
      model: overrideModel || env("AI_MODEL", "XAI_MODEL") || DEFAULT_MODELS.xai,
    };
  }

  const anthropicKey = env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY");
  if (anthropicKey) {
    return {
      id: "anthropic",
      label: "Anthropic Claude",
      kind: "anthropic",
      key: anthropicKey,
      model: overrideModel || env("AI_MODEL", "ANTHROPIC_MODEL") || DEFAULT_MODELS.anthropic,
    };
  }

  return null;
}

export function aiStatus(): { available: boolean; provider: string; model: string } {
  if (process.env.AI_ENABLED === "0") return { available: false, provider: "", model: "" };
  if (process.env.AI_MOCK === "1") return { available: true, provider: "محاكاة", model: "mock" };
  const provider = aiProvider();
  if (!provider) return { available: false, provider: "", model: "" };
  return { available: true, provider: provider.label, model: provider.model };
}

function mockAnswer(prompt: string): string {
  const question = prompt.includes("سؤال المستخدم:")
    ? prompt.slice(prompt.lastIndexOf("سؤال المستخدم:") + "سؤال المستخدم:".length)
    : prompt;
  const short = question.replace(/\s+/g, " ").trim().slice(0, 80);
  return `(محاكاة) جواب على: ${short}`;
}

/** يطلب توليد نص من المزوّد المتاح */
export type AiGenerateInput = {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

/** كل المزوّدين المتوفرين بالترتيب حسب المفاتيح الموجودة */
export function aiProviderList(overrideModel?: string): AiProvider[] {
  const defs: { id: string; names: string[]; make: (key: string) => AiProvider }[] = [
    {
      id: "gemini",
      names: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      make: (key) => ({
        id: "gemini",
        label: "Google Gemini",
        kind: "gemini",
        key,
        model: normalizeGeminiModel(overrideModel || env("AI_MODEL", "GEMINI_FLASH_MODEL") || DEFAULT_MODELS.gemini),
      }),
    },
    {
      id: "openai",
      names: ["OPENAI_API_KEY"],
      make: (key) => ({ id: "openai", label: "OpenAI", kind: "openai", key, baseUrl: "https://api.openai.com/v1", model: overrideModel || env("AI_MODEL", "OPENAI_MODEL") || DEFAULT_MODELS.openai }),
    },
    {
      id: "groq",
      names: ["GROQ_API_KEY"],
      make: (key) => ({ id: "groq", label: "Groq", kind: "openai", key, baseUrl: "https://api.groq.com/openai/v1", model: overrideModel || env("AI_MODEL", "GROQ_MODEL") || DEFAULT_MODELS.groq }),
    },
    {
      id: "openrouter",
      names: ["OPENROUTER_API_KEY"],
      make: (key) => ({ id: "openrouter", label: "OpenRouter", kind: "openai", key, baseUrl: "https://openrouter.ai/api/v1", model: overrideModel || env("AI_MODEL", "OPENROUTER_MODEL") || DEFAULT_MODELS.openrouter }),
    },
    {
      id: "cerebras",
      names: ["CEREBRAS_API_KEY"],
      make: (key) => ({ id: "cerebras", label: "Cerebras", kind: "openai", key, baseUrl: "https://api.cerebras.ai/v1", model: overrideModel || env("AI_MODEL", "CEREBRAS_MODEL") || DEFAULT_MODELS.cerebras }),
    },
    {
      id: "deepseek",
      names: ["DEEPSEEK_API_KEY"],
      make: (key) => ({ id: "deepseek", label: "DeepSeek", kind: "openai", key, baseUrl: "https://api.deepseek.com/v1", model: overrideModel || env("AI_MODEL", "DEEPSEEK_MODEL") || DEFAULT_MODELS.deepseek }),
    },
    {
      id: "xai",
      names: ["XAI_API_KEY", "GROK_API_KEY"],
      make: (key) => ({ id: "xai", label: "xAI Grok", kind: "openai", key, baseUrl: "https://api.x.ai/v1", model: overrideModel || env("AI_MODEL", "XAI_MODEL") || DEFAULT_MODELS.xai }),
    },
    {
      id: "anthropic",
      names: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
      make: (key) => ({ id: "anthropic", label: "Anthropic Claude", kind: "anthropic", key, model: overrideModel || env("AI_MODEL", "ANTHROPIC_MODEL") || DEFAULT_MODELS.anthropic }),
    },
  ];
  const out: AiProvider[] = [];
  for (const def of defs) {
    const key = env(...def.names);
    if (key) out.push(def.make(key));
  }
  return out;
}

/** 🤝 توليد مع تجربة المزوّدين بالترتيب (إذا Gemini مزحوم نكمّلو بـ Groq/OpenRouter) */
export async function aiGenerateWithFallback(input: AiGenerateInput): Promise<AiResult> {
  const providers = aiProviderList(input.model);
  const empty: AiResult = { ok: false, text: "", provider: "", model: "", error: "لا يوجد مفتاح ذكاء اصطناعي في البيئة" };
  if (!providers.length) return empty;
  let last: AiResult = empty;
  for (const provider of providers.slice(0, 3)) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await generateVia(provider, input);
      if (res.ok) return res;
      last = res;
      // 🔁 إذا المزوّد مزحوم (high demand / 429 / 5xx) نعاودو مرة بعد شوية
      if (!/high demand|overload|429|5\d\d|timeout|aborted/i.test(res.error)) break;
      await new Promise((r) => setTimeout(r, 350 + attempt * 400));
    }
  }
  return last;
}

export async function aiGenerate(input: {
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  model?: string;
}): Promise<AiResult> {
  return aiGenerateWithFallback(input);
}

/** توليد عبر مزوّد واحد محدّد */
async function generateVia(provider: AiProvider, input: AiGenerateInput): Promise<AiResult> {
  const empty: AiResult = { ok: false, text: "", provider: provider.label, model: provider.model, error: "" };

  if (process.env.AI_MOCK === "1") {
    return {
      ok: true,
      text: mockAnswer(input.prompt),
      provider: "mock",
      model: "mock",
      error: "",
    };
  }

  const maxTokens = input.maxTokens ?? 600;
  const temperature = input.temperature ?? 0.6;

  try {
    if (provider.kind === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        provider.model,
      )}:generateContent?key=${encodeURIComponent(provider.key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(input.system ? { system_instruction: { parts: [{ text: input.system }] } } : {}),
          contents: [{ role: "user", parts: [{ text: input.prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ...empty, provider: provider.label, model: provider.model, error: json?.error?.message || `HTTP ${res.status}` };
      }
      const text = (json.candidates?.[0]?.content?.parts || [])
        .map((p) => p.text || "")
        .join("")
        .trim();
      return { ok: Boolean(text), text, provider: provider.label, model: provider.model, error: text ? "" : "رد فارغ" };
    }

    if (provider.kind === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": provider.key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: maxTokens,
          temperature,
          ...(input.system ? { system: input.system } : {}),
          messages: [{ role: "user", content: input.prompt }],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(25_000),
      });
      const json = (await res.json()) as {
        content?: { text?: string }[];
        error?: { message?: string };
      };
      if (!res.ok) {
        return { ...empty, provider: provider.label, model: provider.model, error: json?.error?.message || `HTTP ${res.status}` };
      }
      const text = (json.content || []).map((c) => c.text || "").join("").trim();
      return { ok: Boolean(text), text, provider: provider.label, model: provider.model, error: text ? "" : "رد فارغ" };
    }

    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.key}`,
      },
      body: JSON.stringify({
        model: provider.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          ...(input.system ? [{ role: "system", content: input.system }] : []),
          { role: "user", content: input.prompt },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ...empty, provider: provider.label, model: provider.model, error: json?.error?.message || `HTTP ${res.status}` };
    }
    const text = (json.choices?.[0]?.message?.content || "").trim();
    return { ok: Boolean(text), text, provider: provider.label, model: provider.model, error: text ? "" : "رد فارغ" };
  } catch (error) {
    return {
      ...empty,
      provider: provider.label,
      model: provider.model,
      error: error instanceof Error ? error.message : "خطأ غير معروف",
    };
  }
}

/** تحويل رد الماركداون إلى HTML مقبول في تيليغرام */
export function toTelegramHtml(input: string): string {
  const escaped = String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/```([\s\S]*?)```/g, (_m, code: string) => `<pre>${code.trim()}</pre>`)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_]+)__/g, "<b>$1</b>")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[-*]\s+/gm, "• ");
}
