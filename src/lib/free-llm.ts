/**
 * Optional, unverified third-party OpenAI-compatible gateway.
 * The screenshot supplies a URL but neither an API key nor exact model IDs.
 * Never accept a URL or model ID from the browser: only the operator configures them.
 */
import type { ChatTurn } from "@/lib/gemini";
import { ProviderStreamError, streamOpenAICompat } from "@/lib/openai-stream";

const URL = "https://api.free-llm.dev/v1/chat/completions";
const MODEL_ID = /^[\w.\-]+(?:\/[\w.\-:]+)?$/;

export async function streamFreeLlm(o: {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const provider = "free-llm";
  const model = (process.env.FREE_LLM_MODEL ?? "").trim();
  if (process.env.FREE_LLM_ENABLED !== "1" || !model || model.length > 120 || !MODEL_ID.test(model)) {
    throw new ProviderStreamError("MODEL_UNAVAILABLE", provider, "Free LLM gateway is not configured with a valid model ID.");
  }
  // This endpoint's authentication requirements are not verified. Some accounts may
  // require their own key; never publish one in NEXT_PUBLIC_ variables or Git.
  const key = (process.env.FREE_LLM_API_KEY ?? "").trim();
  return streamOpenAICompat({
    provider, url: URL, key, models: [model],
    system: o.system, messages: o.messages,
    maxTokens: Math.min(o.maxTokens, 2048), // conservative; provider output limits are not verified
    signal: o.signal, onModel: (m) => o.onModel?.(`${provider}:${m}`), onDone: o.onDone,
  });
}
