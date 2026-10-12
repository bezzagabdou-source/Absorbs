/**
 * Grok (xAI) — SERVER SIDE ONLY. Pro plan only (gated in the chat route).
 *
 * Env: GROK_API_KEY  (XAI_API_KEY is accepted too — the rest of the project already uses that name)
 * Optional: GROK_MODEL (default grok-2-1212)
 *
 * Clean fallback: if the native xAI call fails (bad key, outage, retired model) and an
 * OPENROUTER_API_KEY exists, the same Grok model is requested through OpenRouter.
 */
import type { ChatTurn } from "@/lib/gemini";
import { ProviderStreamError, envModel, findEnvKey, streamOpenAICompat } from "@/lib/openai-stream";
import { getOpenRouterKey, streamOpenRouter } from "@/lib/openrouter";

export const GROK_URL = "https://api.x.ai/v1/chat/completions";
export const GROK_DEFAULT_MODEL = "grok-2-1212";
const GROK_ID_RE = /^grok-[\w.\-]{1,40}$/;

export function getGrokKey(): string | undefined {
  return findEnvKey(["GROK_API_KEY", "XAI_API_KEY"]);
}

export function isGrokConfigured(): boolean {
  return Boolean(getGrokKey()) || Boolean(getOpenRouterKey());
}

/** native xAI id -> OpenRouter id (only used for the fallback) */
function toOpenRouterId(model: string): string {
  return model === "grok-4" ? "x-ai/grok-4" : model.startsWith("grok-3") ? "x-ai/grok-3" : envModel("OPENROUTER_GROK_MODEL", "x-ai/grok-2-1212");
}

export async function streamGrok(o: {
  model?: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const requested = o.model && GROK_ID_RE.test(o.model) ? o.model : envModel("GROK_MODEL", GROK_DEFAULT_MODEL);
  const key = getGrokKey();

  if (key) {
    try {
      return await streamOpenAICompat({
        provider: "grok",
        url: GROK_URL,
        key,
        models: [requested, envModel("GROK_MODEL", GROK_DEFAULT_MODEL), "grok-2-latest"],
        system: o.system,
        messages: o.messages,
        maxTokens: o.maxTokens,
        temperature: o.temperature,
        signal: o.signal,
        onModel: (m) => o.onModel?.(`grok:${m}`),
        onDone: o.onDone,
      });
    } catch (e) {
      if (!getOpenRouterKey()) throw e; // nothing to fall back to
      console.error("[grok] native xAI failed, trying OpenRouter:", e instanceof Error ? e.message : String(e));
    }
  }

  if (!getOpenRouterKey()) {
    throw new ProviderStreamError("NO_KEY", "grok", "GROK_API_KEY (or XAI_API_KEY) is not configured.");
  }
  return streamOpenRouter({ ...o, model: toOpenRouterId(requested) });
}
