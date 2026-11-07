/**
 * Server-side AI provider presets.
 *
 * The operator picks a provider with two environment variables only:
 *   AI_PROVIDER = gemini | groq | openrouter | mistral | cerebras | together |
 *                 deepseek | xai | openai | custom
 *   AI_MODEL    = <model id>            (optional; preset default otherwise)
 * and puts the matching key in the provider's own variable (GEMINI_API_KEY,
 * GROQ_API_KEY, OPENROUTER_API_KEY, …) or in the generic AI_API_KEY.
 *
 * Every request is OpenAI-compatible except Gemini, and every one of them runs
 * server-side only: no provider key is ever shipped to the browser.
 */
export type ProviderId =
  | "gemini"
  | "groq"
  | "openrouter"
  | "mistral"
  | "cerebras"
  | "together"
  | "deepseek"
  | "xai"
  | "openai"
  | "custom";

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  /** Environment variables that may hold this provider's key, in priority order. */
  keyEnv: string[];
  /** OpenAI-compatible chat-completions endpoint (absent for Gemini). */
  endpoint?: string;
  /** Preferred model when AI_MODEL is not set. */
  defaultModel: string;
  /** Extra headers some providers require. */
  headers?: Record<string, string>;
  /** Gemini is called through its own REST shape. */
  transport: "gemini" | "openai";
};

export const AI_URL_ENV = "AI_API_URL";

export const providerPresets: Record<ProviderId, ProviderPreset> = {
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    keyEnv: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "AI_API_KEY"],
    defaultModel: "gemini-2.0-flash",
    transport: "gemini",
  },
  groq: {
    id: "groq",
    label: "Groq",
    keyEnv: ["GROQ_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    transport: "openai",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyEnv: ["OPENROUTER_API_KEY", "AI_API_KEY"],
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    headers: { "X-Title": "DZ Exchange" },
    transport: "openai",
  },
  mistral: {
    id: "mistral",
    label: "Mistral AI",
    keyEnv: ["MISTRAL_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.mistral.ai/v1/chat/completions",
    defaultModel: "mistral-small-latest",
    transport: "openai",
  },
  cerebras: {
    id: "cerebras",
    label: "Cerebras",
    keyEnv: ["CEREBRAS_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.cerebras.ai/v1/chat/completions",
    defaultModel: "llama-3.3-70b",
    transport: "openai",
  },
  together: {
    id: "together",
    label: "Together AI",
    keyEnv: ["TOGETHER_API_KEY", "TOGETHER_AI_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.together.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
    transport: "openai",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    keyEnv: ["DEEPSEEK_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    defaultModel: "deepseek-chat",
    transport: "openai",
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    keyEnv: ["XAI_API_KEY", "GROK_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.x.ai/v1/chat/completions",
    defaultModel: "grok-3-mini",
    transport: "openai",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    keyEnv: ["OPENAI_API_KEY", "AI_API_KEY"],
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    transport: "openai",
  },
  custom: {
    id: "custom",
    label: "Custom OpenAI-compatible endpoint",
    keyEnv: ["AI_API_KEY"],
    defaultModel: "default",
    transport: "openai",
  },
};

export const providerIds = Object.keys(providerPresets) as ProviderId[];

/** Order used when AI_PROVIDER is absent: the first preset that has a key wins. */
const discoveryOrder: ProviderId[] = [
  "gemini",
  "groq",
  "openrouter",
  "mistral",
  "cerebras",
  "together",
  "deepseek",
  "xai",
  "openai",
];

export type ResolvedProvider = {
  id: ProviderId;
  label: string;
  key: string;
  keyEnv: string;
  endpoint?: string;
  model: string;
  headers: Record<string, string>;
  transport: "gemini" | "openai";
  /** True when AI_PROVIDER was set explicitly (never auto-discovered). */
  explicit: boolean;
};

function readKey(preset: ProviderPreset): { key: string; keyEnv: string } | null {
  for (const name of preset.keyEnv) {
    const value = process.env[name]?.trim();
    if (value) return { key: value, keyEnv: name };
  }
  return null;
}

function cleanModel(value: string | undefined): string | null {
  const model = value?.trim();
  if (!model) return null;
  // Model ids go straight into a URL path for Gemini: keep them boring.
  return /^[a-zA-Z0-9._:/@-]{1,120}$/.test(model) ? model : null;
}

/**
 * Picks the provider that will actually answer:
 * 1. `AI_PROVIDER` when set and its key exists,
 * 2. otherwise the first provider in `discoveryOrder` that has a key,
 * 3. otherwise the configured `custom` endpoint with `AI_API_KEY`.
 * Returns null when nothing is configured (the offline advisor then answers).
 */
export function resolveProvider(): ResolvedProvider | null {
  const requested = process.env.AI_PROVIDER?.trim().toLowerCase() as ProviderId | undefined;
  const modelOverride = cleanModel(process.env.AI_MODEL);

  if (requested && providerPresets[requested]) {
    const preset = providerPresets[requested];
    const found = readKey(preset);
    const endpoint = requested === "custom" ? process.env[AI_URL_ENV]?.trim() : preset.endpoint;
    if (!found || !endpoint) return null;
    if (!/^https:\/\/[\w.-]+(:\d+)?(\/[^\s]*)?$/.test(endpoint)) return null;
    return {
      id: preset.id,
      label: preset.label,
      key: found.key,
      keyEnv: found.keyEnv,
      endpoint,
      model: modelOverride ?? preset.defaultModel,
      headers: preset.headers ?? {},
      transport: preset.transport,
      explicit: true,
    };
  }

  for (const id of discoveryOrder) {
    const preset = providerPresets[id];
    const found = readKey(preset);
    if (!found) continue;
    return {
      id: preset.id,
      label: preset.label,
      key: found.key,
      keyEnv: found.keyEnv,
      endpoint: preset.endpoint,
      model: modelOverride ?? preset.defaultModel,
      headers: preset.headers ?? {},
      transport: preset.transport,
      explicit: false,
    };
  }

  const customEndpoint = process.env[AI_URL_ENV]?.trim();
  if (customEndpoint && process.env.AI_API_KEY?.trim() && /^https:\/\//.test(customEndpoint)) {
    return {
      id: "custom",
      label: providerPresets.custom.label,
      key: process.env.AI_API_KEY.trim(),
      keyEnv: "AI_API_KEY",
      endpoint: customEndpoint,
      model: modelOverride ?? providerPresets.custom.defaultModel,
      headers: {},
      transport: "openai",
      explicit: false,
    };
  }
  return null;
}

/** Non-secret description used by the UI hint and /api/ai/status. */
export function providerSummary(resolved: ResolvedProvider | null) {
  if (!resolved) return { configured: false, provider: null, model: null, mode: "offline" as const };
  return { configured: true, provider: resolved.label, model: resolved.model, mode: "live" as const };
}
