/**
 * NEXUS FORGE v19 — بحيرة النماذج الأسطورية (server-only)
 * ---------------------------------------------------------------------------
 * One build is never written by a single model. The Forge keeps a pool of the
 * strongest available engines, assigns each of them a role (architect, builder,
 * reviewer, repairer), spreads the modules across them, and rotates to the next
 * engine the moment one produces a weak or broken file.
 *
 * Everything degrades gracefully: with only a Gemini key the pool has one
 * member and the Forge still works; with OpenRouter + xAI + Gemini the same
 * build is written by four different brains.
 */
import { streamGemini, type ChatTurn } from "@/lib/gemini";
import { streamSelectedModel } from "@/lib/model-router";
import type { ForgeRole } from "@/lib/forge/types";
import { getOpenRouterKey } from "@/lib/openrouter";
import { getGrokKey } from "@/lib/grok";
import { findGeminiKey } from "@/lib/gemini";
import { findHuggingFaceKey } from "@/lib/huggingface";
import type { ModelSelection, PlanId } from "@/lib/model-access";

export type { ForgeRole };

/** Reads a stream to the end, cancelling it if the caller aborts. */
async function readAllWithSignal(stream: ReadableStream<string>, signal?: AbortSignal): Promise<string> {
  const r = stream.getReader();
  let out = "";
  const onAbort = () => r.cancel().catch(() => undefined);
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) break;
      const { done, value } = await r.read();
      if (done) break;
      out += value;
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
    try {
      r.releaseLock();
    } catch {
      /* already released */
    }
  }
  return out;
}

export type ForgeModel = {
  /** stable id shown in the UI */
  key: string;
  label: string;
  selection: ModelSelection;
  /** what this engine is used for */
  roles: ForgeRole[];
  /** output budget for one call */
  maxTokens: number;
  /** gemini-only: use the epic long-build path */
  epic?: boolean;
  /** gemini-only: skip long thinking for a faster first token */
  lowThink?: boolean;
  /** rough priority inside a role (higher first) */
  rank: number;
};

const hasGemini = () => Boolean(findGeminiKey());
const hasOr = () => Boolean(getOpenRouterKey());
const hasGrok = () => Boolean(getGrokKey());
const hasHf = () => Boolean(findHuggingFaceKey());

/** The full line-up. `plan` gating is applied by `forgePool()`. */
const LINEUP: (ForgeModel & { pro?: boolean })[] = [
  {
    key: "gemini-titan",
    label: "Gemini Titan",
    selection: { provider: "gemini", model: "auto" },
    roles: ["architect", "builder", "reviewer", "repair"],
    maxTokens: 32_000,
    epic: true,
    rank: 96,
  },
  {
    key: "gemini-fast",
    label: "Gemini Flash",
    selection: { provider: "gemini", model: "auto" },
    roles: ["builder", "repair"],
    maxTokens: 16_000,
    lowThink: true,
    rank: 78,
  },
  {
    key: "nexus-claude",
    label: "Nexus Claude 5.1",
    selection: { provider: "openrouter", model: "nexus/claude-5.1" },
    roles: ["architect", "builder", "reviewer", "repair"],
    maxTokens: 24_000,
    rank: 98,
    pro: true,
  },
  {
    key: "nexus-kimi",
    label: "Nexus Kimi Code",
    selection: { provider: "openrouter", model: "nexus/kimi-code" },
    roles: ["builder", "repair"],
    maxTokens: 24_000,
    rank: 95,
    pro: true,
  },
  {
    key: "sonnet-45",
    label: "Claude Sonnet 4.5",
    selection: { provider: "openrouter", model: "anthropic/claude-sonnet-4.5" },
    roles: ["architect", "builder", "reviewer"],
    maxTokens: 20_000,
    rank: 93,
    pro: true,
  },
  {
    key: "deepseek-v31",
    label: "DeepSeek V3.1",
    selection: { provider: "openrouter", model: "deepseek/deepseek-chat-v3.1" },
    roles: ["builder", "reviewer", "repair"],
    maxTokens: 20_000,
    rank: 88,
    pro: true,
  },
  {
    key: "grok-4",
    label: "Grok 4",
    selection: { provider: "grok", model: "grok-4" },
    roles: ["architect", "reviewer", "builder"],
    maxTokens: 16_000,
    rank: 90,
    pro: true,
  },
  {
    key: "gpt-4o",
    label: "GPT-4o",
    selection: { provider: "openrouter", model: "openai/gpt-4o" },
    roles: ["builder", "reviewer"],
    maxTokens: 14_000,
    rank: 84,
    pro: true,
  },
  {
    key: "qwen-coder",
    label: "Qwen3 Coder 480B",
    selection: { provider: "huggingface", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct" },
    roles: ["builder", "repair"],
    maxTokens: 14_000,
    rank: 80,
  },
  {
    key: "deepseek-open",
    label: "DeepSeek V3.1 (open)",
    selection: { provider: "huggingface", model: "deepseek-ai/DeepSeek-V3.1" },
    roles: ["builder", "reviewer"],
    maxTokens: 12_000,
    rank: 74,
  },
  {
    key: "qwen-235b",
    label: "Qwen3 235B",
    selection: { provider: "huggingface", model: "Qwen/Qwen3-235B-A22B-Instruct-2507" },
    roles: ["builder"],
    maxTokens: 12_000,
    rank: 70,
  },
];

/** True when this engine can actually answer right now. */
function reachable(m: ForgeModel): boolean {
  switch (m.selection.provider) {
    case "gemini":
      return hasGemini();
    case "openrouter":
      return hasOr();
    case "grok":
      return hasGrok();
    case "huggingface":
      return hasHf();
    default:
      return false;
  }
}

/**
 * The usable pool for a plan, ordered best-first.
 * Free accounts still get a real multi-model forge (Gemini + open models).
 */
export function forgePool(plan: PlanId = "free"): ForgeModel[] {
  const out = LINEUP.filter((m) => reachable(m) && (plan === "pro" || !m.pro));
  const sorted = out.sort((a, b) => b.rank - a.rank);
  // never empty: if no key at all is configured, keep the Gemini entry so the
  // caller gets a clean NO_PROVIDER error instead of a crash
  return sorted.length ? sorted : [LINEUP[0]];
}

export function forgeRolePool(role: ForgeRole, plan: PlanId = "free"): ForgeModel[] {
  const all = forgePool(plan);
  const withRole = all.filter((m) => m.roles.includes(role));
  return withRole.length ? withRole : all;
}

/** How many engines will write in parallel (bounded by the pool and by cost). */
export function forgeConcurrency(plan: PlanId, scale: string): number {
  const pool = forgePool(plan).filter((m) => m.roles.includes("builder")).length;
  const want = scale === "titan" ? 6 : scale === "big" ? 4 : 3;
  return Math.max(1, Math.min(pool, want, plan === "pro" ? 6 : 3));
}

export type ForgeAsk = {
  text: string;
  /** which engine really answered */
  model: string;
  key: string;
  ms: number;
};

/**
 * One non-streaming call to one engine (the Forge streams progress at the
 * *stage* level, not the token level, so a whole module is read at once).
 */
export async function askForgeModel(
  m: ForgeModel,
  o: { system: string; prompt: string; maxTokens?: number; signal?: AbortSignal; temperature?: number }
): Promise<ForgeAsk> {
  const t0 = Date.now();
  const messages: ChatTurn[] = [{ role: "user", text: o.prompt }];
  let realModel = m.key;
  const onModel = (name: string) => {
    if (name) realModel = name;
  };

  if (m.selection.provider === "gemini") {
    const stream = await streamGemini({
      system: o.system,
      messages,
      tier: "pro",
      task: "code",
      mode: m.epic ? "quality" : "speed",
      maxTokens: Math.min(o.maxTokens ?? m.maxTokens, 32_000),
      epic: m.epic,
      lowThink: m.lowThink,
      temperature: o.temperature,
      noFallback: false,
      onModel,
      onDone: () => {},
    });
    const text = await readAllWithSignal(stream, o.signal);
    return { text, model: realModel, key: m.key, ms: Date.now() - t0 };
  }

  const stream = await streamSelectedModel({
    selection: m.selection,
    system: o.system,
    messages,
    maxTokens: Math.min(o.maxTokens ?? m.maxTokens, 24_000),
    signal: o.signal,
    onModel,
    onDone: () => {},
  });
  const text = await readAllWithSignal(stream, o.signal);
  return { text, model: realModel, key: m.key, ms: Date.now() - t0 };
}

/**
 * Tries every engine of a role in order until one returns usable text.
 * `accept` decides what "usable" means (size, no placeholders, parses…).
 */
export async function askRole(
  role: ForgeRole,
  o: {
    plan: PlanId;
    system: string;
    prompt: string;
    maxTokens?: number;
    signal?: AbortSignal;
    accept?: (r: ForgeAsk) => boolean;
    /** engines already used for this job — they go last */
    avoid?: string[];
    onTry?: (m: ForgeModel, state: "start" | "fail" | "done", note?: string) => void;
  }
): Promise<ForgeAsk | null> {
  const avoid = new Set(o.avoid ?? []);
  const pool = forgeRolePool(role, o.plan).sort((a, b) => Number(avoid.has(a.key)) - Number(avoid.has(b.key)));
  let last: ForgeAsk | null = null;

  for (const m of pool) {
    if (o.signal?.aborted) return last;
    o.onTry?.(m, "start");
    try {
      const r = await askForgeModel(m, { system: o.system, prompt: o.prompt, maxTokens: o.maxTokens, signal: o.signal });
      if (!r.text || r.text.trim().length < 20) {
        o.onTry?.(m, "fail", "empty");
        continue;
      }
      last = r;
      if (!o.accept || o.accept(r)) {
        o.onTry?.(m, "done");
        return r;
      }
      o.onTry?.(m, "fail", "weak");
    } catch (e) {
      o.onTry?.(m, "fail", e instanceof Error ? e.message.slice(0, 80) : "error");
      if (o.signal?.aborted) return last;
    }
  }
  return last;
}

/**
 * Streaming variant: the caller watches the tokens (used by the design studio,
 * where the user sees the improved document being written).
 */
export async function* streamForgeModel(
  m: ForgeModel,
  o: { system: string; prompt: string; maxTokens?: number; signal?: AbortSignal }
): AsyncGenerator<string, ForgeAsk> {
  const t0 = Date.now();
  const messages: ChatTurn[] = [{ role: "user", text: o.prompt }];
  let realModel = m.key;
  const onModel = (name: string) => {
    if (name) realModel = name;
  };
  const stream =
    m.selection.provider === "gemini"
      ? await streamGemini({
          system: o.system,
          messages,
          tier: "pro",
          task: "code",
          mode: "quality",
          maxTokens: Math.min(o.maxTokens ?? m.maxTokens, 32_000),
          epic: true,
          temperature: 0.4,
          noFallback: false,
          onModel,
          onDone: () => {},
        })
      : await streamSelectedModel({
          selection: m.selection,
          system: o.system,
          messages,
          maxTokens: Math.min(o.maxTokens ?? m.maxTokens, 24_000),
          signal: o.signal,
          onModel,
          onDone: () => {},
        });

  const reader = stream.getReader();
  let out = "";
  const onAbort = () => reader.cancel().catch(() => undefined);
  o.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      if (o.signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        out += value;
        yield value;
      }
    }
  } finally {
    o.signal?.removeEventListener("abort", onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
  return { text: out, model: realModel, key: m.key, ms: Date.now() - t0 };
}

/** First engine of a role that can actually answer right now. */
export function pickEngine(role: ForgeRole, plan: PlanId = "free"): ForgeModel {
  return forgeRolePool(role, plan)[0];
}

/** Human list of the engines that will take part in this build. */
export function forgeLineup(plan: PlanId): { key: string; label: string; roles: ForgeRole[] }[] {
  return forgePool(plan).map((m) => ({ key: m.key, label: m.label, roles: m.roles }));
}
