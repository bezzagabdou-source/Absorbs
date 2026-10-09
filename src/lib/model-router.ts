/**
 * ═══════════════════════════════════════════════════════════════════════
 *  UNIFIED AI ROUTER ENGINE  ·  `src/lib/model-router.ts`  (SERVER ONLY)
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  One entry point that routes any request to the best available engine —
 *  OpenAI, Anthropic (Claude), Google Gemini, xAI Grok, or OpenRouter —
 *  based on the content kind (code / vision / audio / search / speed-first /
 *  reasoning) and on cost, with automatic failover across the whole fleet.
 *
 *  ┌───────────────────────────────────────────────────────────────────┐
 *  │ BACKWARD COMPATIBILITY (existing callers keep working untouched):  │
 *  │   • FUSED_MODELS           — virtual Nexus model definitions       │
 *  │   • streamSelectedModel()  — explicit user/provider selection      │
 *  ├───────────────────────────────────────────────────────────────────┤
 *  │ NEW UNIFIED ENGINE:                                                │
 *  │   • detectContentKind()    — content-aware classification          │
 *  │   • buildRoutingPlan()     — scored, cost-aware candidate ladder   │
 *  │   • streamUnified()        — auto-routed streaming with failover   │
 *  │   • completeUnified()      — non-streaming helper (agents, RAG)    │
 *  └───────────────────────────────────────────────────────────────────┘
 *
 *  Every transport uses plain fetch/SSE — no vendor SDK — so a missing or
 *  rotating API key can never break the Vercel build: engines without a key
 *  are simply skipped at runtime.
 */

import type { ChatTurn } from "@/lib/gemini";
import type { ModelSelection } from "@/lib/model-access";
import { streamGrok, getGrokKey, GROK_DEFAULT_MODEL } from "@/lib/grok";
import { streamOpenRouter, getOpenRouterKey, OPENROUTER_DEFAULT_MODEL } from "@/lib/openrouter";
import { streamHuggingFace, findHuggingFaceKey, huggingFaceModels } from "@/lib/huggingface";
import { ProviderStreamError, envModel, findEnvKey, streamOpenAICompat } from "@/lib/openai-stream";
import { classifyTask } from "@/lib/task-router";

const env = (n: string, d: string): string => (process.env[n] ?? "").trim() || d;

/* ════════════════════════ 1 · LEGACY API (unchanged contract) ════════════════════════ */

/**
 * Virtual "fused" Nexus models. They are not single upstream models: each one is a lead engine
 * plus ordered backups (instant failover) and a short quality contract appended to the prompt.
 * Every id can be overridden from env so a newer upstream model can be dropped in without a rebuild.
 */
export const FUSED_MODELS: Record<string, { lead: () => string; backups: () => string[]; addon: string }> = {
  "nexus/claude-5.1": {
    lead: () => env("OPENROUTER_CLAUDE51_MODEL", "anthropic/claude-sonnet-4.5"),
    backups: () => [
      env("OPENROUTER_CLAUDE51_BACKUP", "deepseek/deepseek-chat-v3.1"),
      env("OPENROUTER_CLAUDE51_BACKUP2", "google/gemini-2.5-pro"),
    ],
    addon:
      "\n\n[Nexus Claude 5.1] Work like a senior engineer: plan silently, then answer directly. Re-check code, numbers and logic before you output. " +
      "Never leave a file half-written, never output placeholder comments, and match the user's language and dialect.",
  },
  "nexus/kimi-code": {
    lead: () => env("OPENROUTER_KIMI_MODEL", "moonshotai/kimi-k2"),
    backups: () => [
      env("OPENROUTER_KIMI_BACKUP", "qwen/qwen3-coder"),
      env("OPENROUTER_KIMI_BACKUP2", "deepseek/deepseek-chat-v3.1"),
    ],
    addon:
      "\n\n[Nexus Kimi Code] You are the coding specialist. Write complete, runnable code in as few files as possible, with no omissions and no TODOs. " +
      "Prefer a single self-contained file for games and small apps, and test edge cases mentally before replying.",
  },
};

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
  const fused = o.selection.provider === "openrouter" && model ? FUSED_MODELS[model] : undefined;
  if (fused) {
    return streamOpenRouter({
      ...common,
      model: fused.lead(),
      alsoTry: fused.backups(),
      system: o.system + fused.addon,
    });
  }
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

/* ════════════════════════ 2 · CONTENT-KIND DETECTION ════════════════════════ */

/** The driving dimension of the unified router. */
export type ContentKind =
  | "code"       // برمجة — correctness + completeness first
  | "vision"     // صور/ملفات — image/PDF understanding
  | "audio"      // صوت — transcription / spoken-style answers
  | "search"     // بحث — fresh facts, synthesis, citations
  | "fast"       // سرعة استجابة — sub-second feel
  | "reasoning"  // منطق ورياضيات — step-checked
  | "creative"   // إبداع — originality
  | "general";

const RE_AUDIO =
  /(تسجيل صوتي|رسالة صوتية|صوتي|مقطع صوت|فريديو|أوديو|نسخ صوتي|transcri(?:be|ption)|audio (?:file|message)|voice (?:note|message)|podcast)/i;
const RE_SEARCH =
  /(ابحث|فتش|أخبار اليوم|سعر |أسعار|الطقس|آخر الأخبار|اليوم في|actualit[ée]s?|latest news|search the web|look up|price of|weather|breaking)/i;
const RE_SPEED =
  /(بسرعة|هوني|دغيا|رد مختصر|باختصار شديد|quick answer|answer fast|asap|tldr|tl;dr|في سطر|بجملة)/i;

/**
 * Classifies the request into a ContentKind. Media attachments win (vision),
 * then explicit audio/search/speed signals, then the shared task classifier.
 */
export function detectContentKind(
  text: string,
  o: { hasMedia?: boolean; hasAudio?: boolean } = {}
): ContentKind {
  const t = (text ?? "").trim();
  if (o.hasMedia) return "vision";
  if (o.hasAudio || RE_AUDIO.test(t)) return "audio";
  if (RE_SPEED.test(t) || (t.length > 0 && t.length <= 40)) return "fast";
  if (RE_SEARCH.test(t)) return "search";
  switch (classifyTask(t, o.hasMedia)) {
    case "code":
      return "code";
    case "reasoning":
      return "reasoning";
    case "creative":
      return "creative";
    case "quick":
      return "fast";
    case "vision":
      return "vision";
    case "writing":
      return "search"; // writing benefits from the same long-context engines as research
    default:
      return "general";
  }
}

/* ════════════════════════ 3 · ENGINE PROFILES ════════════════════════ */

export type EngineId = "openai" | "anthropic" | "gemini" | "grok" | "openrouter" | "huggingface";
export type Transport = "direct" | "openrouter" | "native-gemini";

export interface EngineProfile {
  id: EngineId;
  /** relative strength per kind, 0 (weak) – 5 (excellent) */
  strength: Record<ContentKind, number>;
  /** capacity 0–5 — broad quality ceiling */
  capacity: number;
  /** relative latency rank 1 (fastest) – 5 (slowest) */
  latency: number;
  /** approx. blended cost, USD per 1M tokens (in+out average) */
  costPerM: number;
  /** understands attached images / PDFs */
  vision: boolean;
  /** low streaming time-to-first-token */
  streamingFast: boolean;
  /** env keys that unlock a DIRECT connection to this vendor */
  directKeys: readonly string[];
  /** default direct model id */
  defaultModel: () => string;
  /** model id used when reached THROUGH OpenRouter */
  openRouterModel: () => string;
  /** short Arabic label for the UI progress banner */
  labelAr: string;
}

export const ENGINE_PROFILES: Record<EngineId, EngineProfile> = {
  anthropic: {
    id: "anthropic",
    strength: { code: 5, reasoning: 5, creative: 4, writing: 5, vision: 4, search: 4, fast: 3, audio: 2, general: 5 } as Record<ContentKind, number>,
    capacity: 5,
    latency: 3,
    costPerM: 9,
    vision: true,
    streamingFast: false,
    directKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    defaultModel: () => envModel("ANTHROPIC_MODEL", "claude-sonnet-4-5"),
    openRouterModel: () => envModel("OPENROUTER_CLAUDE_MODEL", "anthropic/claude-sonnet-4.5"),
    labelAr: "Claude — الأقوى للكود والكتابة",
  },
  openai: {
    id: "openai",
    strength: { code: 5, reasoning: 4, creative: 4, writing: 5, vision: 4, search: 4, fast: 4, audio: 4, general: 5 } as Record<ContentKind, number>,
    capacity: 5,
    latency: 3,
    costPerM: 7,
    vision: true,
    streamingFast: true,
    directKeys: ["OPENAI_API_KEY"],
    defaultModel: () => envModel("OPENAI_MODEL", "gpt-4o-mini"),
    openRouterModel: () => envModel("OPENROUTER_OPENAI_MODEL", "openai/gpt-4o"),
    labelAr: "OpenAI — متعدد المهام وسريع",
  },
  gemini: {
    id: "gemini",
    strength: { code: 4, reasoning: 4, creative: 4, writing: 4, vision: 5, search: 5, fast: 4, audio: 5, general: 4 } as Record<ContentKind, number>,
    capacity: 4,
    latency: 2,
    costPerM: 1.5,
    vision: true,
    streamingFast: true,
    directKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
    defaultModel: () => envModel("GEMINI_PRO_MODEL", "gemini-2.5-pro"),
    openRouterModel: () => envModel("OPENROUTER_GEMINI_MODEL", "google/gemini-2.5-pro"),
    labelAr: "Gemini — سياق طويل وصور",
  },
  grok: {
    id: "grok",
    strength: { code: 4, reasoning: 4, creative: 5, writing: 4, vision: 2, search: 4, fast: 4, audio: 1, general: 4 } as Record<ContentKind, number>,
    capacity: 4,
    latency: 3,
    costPerM: 6,
    vision: false,
    streamingFast: true,
    directKeys: ["GROK_API_KEY", "XAI_API_KEY"],
    defaultModel: () => envModel("GROK_MODEL", GROK_DEFAULT_MODEL),
    openRouterModel: () => envModel("OPENROUTER_GROK_MODEL", "x-ai/grok-2-1212"),
    labelAr: "Grok — إبداع وجرأة",
  },
  openrouter: {
    id: "openrouter",
    strength: { code: 4, reasoning: 4, creative: 4, writing: 4, vision: 3, search: 4, fast: 3, audio: 3, general: 4 } as Record<ContentKind, number>,
    capacity: 4,
    latency: 3,
    costPerM: 3,
    vision: true,
    streamingFast: true,
    directKeys: ["OPENROUTER_API_KEY"],
    defaultModel: () => envModel("OPENROUTER_FALLBACK_MODEL", OPENROUTER_DEFAULT_MODEL),
    openRouterModel: () => envModel("OPENROUTER_FALLBACK_MODEL", OPENROUTER_DEFAULT_MODEL),
    labelAr: "OpenRouter — بوابة النماذج",
  },
  huggingface: {
    id: "huggingface",
    strength: { code: 4, reasoning: 3, creative: 3, writing: 3, vision: 0, search: 2, fast: 4, audio: 0, general: 3 } as Record<ContentKind, number>,
    capacity: 3,
    latency: 2,
    costPerM: 0.5,
    vision: false,
    streamingFast: true,
    directKeys: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
    defaultModel: () => huggingFaceModels()[0] ?? "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    openRouterModel: () => envModel("OPENROUTER_HF_MODEL", "qwen/qwen3-coder"),
    labelAr: "نماذج مفتوحة — اقتصادية",
  },
};

/* ════════════════════════ 4 · AVAILABILITY + SCORING ════════════════════════ */

export function hasDirectKey(engine: EngineId): boolean {
  return Boolean(findEnvKey(ENGINE_PROFILES[engine].directKeys));
}

/** True when the engine is reachable right now (direct key, or via OpenRouter). */
export function engineAvailable(engine: EngineId): boolean {
  if (hasDirectKey(engine)) return true;
  if (engine === "openrouter") return false; // no meta-route through itself
  if (engine === "gemini") return Boolean(ENGINE_PROFILES.gemini.directKeys.some((k) => findEnvKey([k])));
  return Boolean(getOpenRouterKey()); // anthropic / openai / grok / huggingface via the gateway
}

export function availableEngines(): EngineId[] {
  return (Object.keys(ENGINE_PROFILES) as EngineId[]).filter(engineAvailable);
}

export interface RouteCandidate {
  engine: EngineId;
  /** resolved upstream model id */
  model: string;
  transport: Transport;
  /** 1 = cheapest … 3 = premium */
  costTier: 1 | 2 | 3;
  /** final weighted score (higher = better) */
  score: number;
  /** why this engine, shown in the UI (Arabic) */
  reason: string;
}

export interface RoutingPlan {
  kind: ContentKind;
  /** ordered best-first; empty = nothing configured at all */
  candidates: RouteCandidate[];
  prefer: RoutePrefer;
}

export type RoutePrefer = "auto" | "cheap" | "fast" | "quality";

export interface BuildPlanOptions {
  hasMedia?: boolean;
  hasAudio?: boolean;
  prefer?: RoutePrefer;
  /** engines to skip (e.g. the user's pins, rate-limited ones) */
  exclude?: readonly EngineId[];
  /** force a content kind (skips detection) */
  kindOverride?: ContentKind;
}

const costTierOf = (costPerM: number): 1 | 2 | 3 => (costPerM <= 2 ? 1 : costPerM <= 6 ? 2 : 3);

function resolveCandidate(engine: EngineId): RouteCandidate | null {
  const p = ENGINE_PROFILES[engine];
  if (hasDirectKey(engine)) {
    return {
      engine,
      model: p.defaultModel(),
      transport: engine === "openai" || engine === "anthropic" || engine === "grok" || engine === "openrouter" || engine === "huggingface" ? "direct" : "native-gemini",
      costTier: costTierOf(p.costPerM),
      score: 0,
      reason: `${p.labelAr} (مباشر)`,
    };
  }
  if (engine !== "openrouter" && getOpenRouterKey()) {
    return {
      engine,
      model: p.openRouterModel(),
      transport: "openrouter",
      costTier: costTierOf(p.costPerM + 1.5), // gateway markup
      score: 0,
      reason: `${p.labelAr} عبر OpenRouter`,
    };
  }
  return null;
}

/**
 * Scores every reachable engine for this request and returns the failover ladder.
 *
 *   auto    → 55% strength-for-kind · 20% capacity · 15% cost · 10% latency
 *   cheap   → 35% strength · 45% cost (cheapest tier first)
 *   fast    → 35% strength · 45% latency (streaming speed first)
 *   quality → 40% strength · 50% capacity (price ignored)
 */
export function buildRoutingPlan(text: string, o: BuildPlanOptions = {}): RoutingPlan {
  const kind = o.kindOverride ?? detectContentKind(text, o);
  const prefer = o.prefer ?? "auto";
  const excluded = new Set(o.exclude ?? []);

  const W: Record<RoutePrefer, { s: number; c: number; cost: number; lat: number }> = {
    auto: { s: 0.55, c: 0.2, cost: 0.15, lat: 0.1 },
    cheap: { s: 0.35, c: 0.1, cost: 0.45, lat: 0.1 },
    fast: { s: 0.35, c: 0.1, cost: 0.1, lat: 0.45 },
    quality: { s: 0.4, c: 0.5, cost: 0.02, lat: 0.08 },
  };
  const w = W[prefer];

  const candidates: RouteCandidate[] = [];
  for (const engine of availableEngines()) {
    if (excluded.has(engine)) continue;
    const p = ENGINE_PROFILES[engine];
    if (o.hasMedia && !p.vision) continue; // blind engines can't take attachments
    const cand = resolveCandidate(engine);
    if (!cand) continue;
    const strength = p.strength[kind] / 5;
    const costScore = 1 - Math.min(1, p.costPerM / 12);
    const latScore = 1 - (p.latency - 1) / 5 + (p.streamingFast ? 0.1 : 0);
    cand.score =
      Math.round((strength * w.s + (p.capacity / 5) * w.c + costScore * w.cost + latScore * w.lat) * 1000) / 1000;
    cand.reason = `${p.labelAr} · ملاءمة ${Math.round(strength * 100)}%`;
    candidates.push(cand);
  }

  candidates.sort((a, b) => b.score - a.score || a.costTier - b.costTier);
  return { kind, candidates, prefer };
}

/** Rough estimate of a request's blended cost in USD — for UI badges / budgets. */
export function estimateCostUsd(candidate: RouteCandidate, inputChars: number, outputChars = 2000): number {
  const p = ENGINE_PROFILES[candidate.engine];
  const tokens = (inputChars + outputChars) / 4;
  return Math.round(((tokens / 1_000_000) * p.costPerM) * 10000) / 10000;
}

/* ════════════════════════ 5 · TRANSPORTS ════════════════════════ */

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export function getOpenAiKey(): string | undefined {
  return findEnvKey(["OPENAI_API_KEY"]);
}
export function getAnthropicKey(): string | undefined {
  return findEnvKey(["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]);
}

/** Direct OpenAI (any OpenAI-compatible endpoint via OPENAI_BASE_URL override). */
export async function streamOpenAIDirect(o: {
  model?: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const key = getOpenAiKey();
  if (!key) throw new ProviderStreamError("NO_KEY", "openai", "OPENAI_API_KEY is not configured.");
  const url = (process.env.OPENAI_BASE_URL ?? "").trim() || OPENAI_URL;
  return streamOpenAICompat({
    provider: "openai",
    url,
    key,
    models: [o.model ?? "", envModel("OPENAI_MODEL", "gpt-4o-mini"), "gpt-4o"],
    system: o.system,
    messages: o.messages,
    temperature: o.temperature,
    maxTokens: o.maxTokens,
    signal: o.signal,
    onModel: (m) => o.onModel?.(`openai:${m}`),
    onDone: o.onDone,
  });
}

/** Incremental SSE reader for the Anthropic Messages API (content_block_delta). */
class AnthropicSse {
  private buf = "";
  private readonly dec = new TextDecoder();
  constructor(private readonly reader: ReadableStreamDefaultReader<Uint8Array>) {}
  async next(): Promise<string | null> {
    for (;;) {
      const nl = this.buf.indexOf("\n");
      if (nl >= 0) {
        const line = this.buf.slice(0, nl).trim();
        this.buf = this.buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const j = JSON.parse(data) as {
            type?: string;
            error?: { message?: string };
            delta?: { type?: string; text?: string };
          };
          if (j.type === "error") throw new ProviderStreamError("UPSTREAM", "anthropic", (j.error?.message ?? "stream error").slice(0, 200));
          if (j.type === "content_block_delta" && j.delta?.text) return j.delta.text;
          if (j.type === "message_stop") return null;
        } catch (e) {
          if (e instanceof ProviderStreamError) throw e;
        }
        continue;
      }
      const { done, value } = await this.reader.read();
      if (done) return this.buf.trim() ? ((this.buf += "\n"), await this.next()) : null;
      this.buf += this.dec.decode(value, { stream: true });
    }
  }
}

/** Direct Anthropic Messages API streaming — plain fetch + SSE, no SDK. */
export async function streamAnthropicDirect(o: {
  model?: string;
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onModel?: (model: string) => void;
  onDone?: (full: string) => void | Promise<void>;
}): Promise<ReadableStream<string>> {
  const key = getAnthropicKey();
  if (!key) throw new ProviderStreamError("NO_KEY", "anthropic", "ANTHROPIC_API_KEY is not configured.");
  const model = o.model ?? envModel("ANTHROPIC_MODEL", "claude-sonnet-4-5");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: Math.min(o.maxTokens, 64_000),
      temperature: o.temperature ?? 0.6,
      system: o.system,
      messages: o.messages.map((m) => ({ role: m.role === "model" ? "assistant" : "user", content: m.text })),
    }),
    signal: o.signal,
  });
  if (!res.ok || !res.body) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new ProviderStreamError("UPSTREAM", "anthropic", `HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  o.onModel?.(`anthropic:${model}`);
  const sse = new AnthropicSse(res.body.getReader());
  let acc = "";
  const onDone = o.onDone;
  return new ReadableStream<string>({
    async pull(c) {
      const chunk = await sse.next();
      if (chunk === null) {
        c.close();
        if (onDone) await onDone(acc);
        return;
      }
      acc += chunk;
      c.enqueue(chunk);
    },
    cancel() {
      void res.body?.cancel().catch(() => undefined);
    },
  });
}

/* ════════════════════════ 6 · UNIFIED STREAMING WITH FAILOVER ════════════════════════ */

export interface UnifiedStreamOptions {
  system: string;
  messages: ChatTurn[];
  maxTokens: number;
  /** the raw user text — drives content-kind detection */
  userText: string;
  hasMedia?: boolean;
  hasAudio?: boolean;
  prefer?: RoutePrefer;
  exclude?: readonly EngineId[];
  signal?: AbortSignal;
  /**
   * Native Gemini transport — injected by the chat route so the unified engine
   * can use the project's battle-tested Gemini pipeline without a circular import.
   */
  nativeGemini?: (o: {
    system: string;
    messages: ChatTurn[];
    maxTokens: number;
    signal?: AbortSignal;
  }) => Promise<ReadableStream<string>>;
  onModel?: (model: string) => void;
  onRoute?: (info: { kind: ContentKind; engine: EngineId; model: string; transport: Transport; attempt: number; of: number }) => void;
  onDone?: (full: string) => void | Promise<void>;
}

/**
 * The unified entry point: builds the cost-and-content-aware routing plan,
 * then walks it best-first. A candidate that dies before producing the full
 * answer hands over to the next one automatically.
 */
export async function streamUnified(o: UnifiedStreamOptions): Promise<ReadableStream<string>> {
  const plan = buildRoutingPlan(o.userText, {
    hasMedia: o.hasMedia,
    hasAudio: o.hasAudio,
    prefer: o.prefer,
    exclude: o.exclude,
  });
  if (!plan.candidates.length) {
    throw new ProviderStreamError(
      "NO_KEY",
      "unified",
      "No AI engine is configured. Add at least one key (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY…)."
    );
  }

  const errors: string[] = [];
  for (let i = 0; i < plan.candidates.length; i++) {
    const cand = plan.candidates[i];
    o.onRoute?.({
      kind: plan.kind,
      engine: cand.engine,
      model: cand.model,
      transport: cand.transport,
      attempt: i + 1,
      of: plan.candidates.length,
    });
    try {
      return await openCandidateStream(cand, o);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${cand.engine}: ${msg.slice(0, 120)}`);
      if (o.signal?.aborted) throw e;
      console.warn(`[unified-router] ${cand.engine} failed (${msg.slice(0, 120)}) — next candidate`);
    }
  }
  throw new ProviderStreamError("UPSTREAM", "unified", errors.join(" | ") || "all engines failed");
}

async function openCandidateStream(cand: RouteCandidate, o: UnifiedStreamOptions): Promise<ReadableStream<string>> {
  const common = {
    system: o.system,
    messages: o.messages,
    maxTokens: o.maxTokens,
    signal: o.signal,
    onModel: o.onModel ?? (() => undefined),
    onDone: o.onDone ?? (() => undefined),
  };
  switch (cand.transport) {
    case "direct":
      switch (cand.engine) {
        case "openai":
          return streamOpenAIDirect({ ...common, model: cand.model });
        case "anthropic":
          return streamAnthropicDirect({ ...common, model: cand.model });
        case "grok":
          return streamGrok({ ...common, model: cand.model });
        case "openrouter":
          return streamOpenRouter({ ...common, model: cand.model });
        case "huggingface":
          return streamHuggingFace({ ...common, model: cand.model });
        default:
          throw new ProviderStreamError("NO_KEY", cand.engine, "no direct transport");
      }
    case "openrouter":
      return streamOpenRouter({ ...common, model: cand.model });
    case "native-gemini":
      if (!o.nativeGemini) throw new ProviderStreamError("NO_KEY", "gemini", "native Gemini transport not injected");
      return o.nativeGemini(common);
    default:
      throw new ProviderStreamError("UPSTREAM", cand.engine, "unknown transport");
  }
}

/**
 * Non-streaming convenience wrapper — used by the agent engine, the RAG
 * summariser and other autonomous jobs that just need the full text.
 */
export async function completeUnified(o: Omit<UnifiedStreamOptions, "onDone">): Promise<{ text: string; model: string }> {
  let model = "";
  const stream = await streamUnified({ ...o, onModel: (m) => { model = m; } });
  const reader = stream.getReader();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += value;
    if (text.length > 400_000) break; // hard guard against runaway generations
  }
  return { text, model };
}
