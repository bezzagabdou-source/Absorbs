/**
 * OpenRouter (https://openrouter.ai) — SERVER SIDE ONLY.
 * One key, hundreds of models (Claude, GPT-4o, DeepSeek, ...). Pro plan only (gated in the chat route).
 *
 * Env: OPENROUTER_API_KEY
 * Optional: OPENROUTER_FALLBACK_MODEL (tried when the requested model is unavailable)
 */
import type { ChatTurn } from "@/lib/gemini";
import {
  ProviderStreamError,
  envModel,
  findEnvKey,
  streamOpenAICompat,
} from "@/lib/openai-stream";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";

/** vendor/name[:variant] — the only shape accepted from a request body. */
export const OPENROUTER_ID_RE = /^[\w.\-]+\/[\w.\-:]+$/;

export function getOpenRouterKey(): string | undefined {
  return findEnvKey(["OPENROUTER_API_KEY"]);
}

export function isOpenRouterConfigured(): boolean {
  return Boolean(getOpenRouterKey());
}

export function openRouterFallbackModel(): string {
  return envModel("OPENROUTER_FALLBACK_MODEL", "deepseek/deepseek-chat-v3.1");
}

export async function streamOpenRouter(o: {
  model?: string;
  /** extra engines tried in order if the first one is busy (instant failover, no error shown) */
  alsoTry?: string[];
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const key = getOpenRouterKey();
  if (!key) throw new ProviderStreamError("NO_KEY", "openrouter", "OPENROUTER_API_KEY is not configured.");
  const requested = o.model && OPENROUTER_ID_RE.test(o.model) && o.model.length <= 120 ? o.model : OPENROUTER_DEFAULT_MODEL;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  return streamOpenAICompat({
    provider: "openrouter",
    url: OPENROUTER_URL,
    key,
    models: Array.from(
      new Set([requested, ...(o.alsoTry ?? []).filter((m) => OPENROUTER_ID_RE.test(m)), openRouterFallbackModel()])
    ),
    system: o.system,
    messages: o.messages,
    maxTokens: o.maxTokens,
    temperature: o.temperature,
    signal: o.signal,
    headers: {
      "X-Title": "Nexus AI",
      ...(/^https?:\/\//i.test(site) ? { "HTTP-Referer": site } : {}),
    },
    onModel: (m) => o.onModel?.(`openrouter:${m}`),
    onDone: o.onDone,
  });
}
