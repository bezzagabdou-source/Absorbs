/**
 * Maps the client's provider choice to a streaming call — SERVER SIDE ONLY.
 * Gemini keeps using the project's existing engine (streamGemini) in the chat route;
 * this file only handles the three "external" providers.
 */
import type { ChatTurn } from "@/lib/gemini";
import type { ModelSelection } from "@/lib/model-access";
import { streamGrok } from "@/lib/grok";
import { streamOpenRouter } from "@/lib/openrouter";
import { streamHuggingFace } from "@/lib/huggingface";

export async function streamSelectedModel(o: {
  selection: ModelSelection;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  signal?: AbortSignal;
  onModel: (model: string) => void;
  onDone: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const model = o.selection.model && o.selection.model !== "auto" ? o.selection.model : undefined;
  const common = {
    model,
    system: o.system,
    messages: o.messages,
    maxTokens: o.maxTokens,
    signal: o.signal,
    onModel: o.onModel,
    onDone: o.onDone,
  };
  switch (o.selection.provider) {
    case "grok":
      return streamGrok(common);
    case "openrouter":
      return streamOpenRouter(common);
    case "huggingface":
      return streamHuggingFace(common);
    default:
      throw new Error("gemini is handled by the chat route");
  }
}
