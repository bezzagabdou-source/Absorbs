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
async function readAllWithSignal(
  stream: ReadableStream<string>,
  signal?: AbortSignal,
  onChunk?: (d: string) => void
): Promise<string> {
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
      if (value && onChunk) onChunk(value);
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
  /** v20 — open-weight / open-source engine (shown honestly in the UI) */
  open?: boolean;
  /** v20 — free-tier endpoint: usable without a Pro plan and without extra cost */
  free?: boolean;
  /** v20 — fastest first token in the line-up (used by the DUO fast path) */
  quick?: boolean;
};

const hasGemini = () => Boolean(findGeminiKey());
const hasOr = () => Boolean(getOpenRouterKey());
const hasGrok = () => Boolean(getGrokKey());
const hasHf = () => Boolean(findHuggingFaceKey());

/** The full line-up. `plan` gating is applied by `forgePool()`. */
const LINEUP: (ForgeModel & { pro?: boolean })[] = [
  /* ── native engine (the backbone: long output, deep thinking) ── */
  {
    key: "titan",
    label: "Nexus Titan",
    selection: { provider: "gemini", model: "auto" },
    roles: ["architect", "builder", "reviewer", "repair", "designer"],
    maxTokens: 32_000,
    epic: true,
    rank: 96,
  },
  {
    key: "swift",
    label: "Nexus Swift",
    selection: { provider: "gemini", model: "auto" },
    roles: ["builder", "repair", "designer"],
    maxTokens: 16_000,
    lowThink: true,
    quick: true,
    rank: 90,
  },

  /* ── routed heavyweights (Pro) ── */
  {
    key: "sage",
    label: "Nexus Sage",
    selection: { provider: "openrouter", model: "nexus/claude-5.1" },
    roles: ["architect", "builder", "reviewer", "repair", "designer"],
    maxTokens: 24_000,
    rank: 98,
    pro: true,
  },
  {
    key: "code-forge",
    label: "Nexus CodeForge",
    selection: { provider: "openrouter", model: "nexus/kimi-code" },
    roles: ["builder", "repair"],
    maxTokens: 24_000,
    rank: 95,
    pro: true,
  },
  {
    key: "architect",
    label: "Nexus Architect",
    selection: { provider: "openrouter", model: "anthropic/claude-sonnet-4.5" },
    roles: ["architect", "builder", "reviewer"],
    maxTokens: 20_000,
    rank: 93,
    pro: true,
  },
  {
    key: "deep-code",
    label: "Nexus DeepCode",
    selection: { provider: "openrouter", model: "deepseek/deepseek-chat-v3.1" },
    roles: ["builder", "reviewer", "repair"],
    maxTokens: 20_000,
    rank: 88,
    pro: true,
  },
  {
    key: "vector",
    label: "Nexus Vector",
    selection: { provider: "grok", model: "grok-4" },
    roles: ["architect", "reviewer", "builder"],
    maxTokens: 16_000,
    rank: 89,
    pro: true,
  },
  {
    key: "general",
    label: "Nexus General",
    selection: { provider: "openrouter", model: "openai/gpt-4o" },
    roles: ["builder", "reviewer"],
    maxTokens: 14_000,
    rank: 84,
    pro: true,
  },

  /* ── open-weight engines (Hugging Face inference) ── */
  {
    key: "open-coder",
    label: "Nexus OpenCoder",
    selection: { provider: "huggingface", model: "Qwen/Qwen3-Coder-480B-A35B-Instruct" },
    roles: ["builder", "repair"],
    maxTokens: 14_000,
    rank: 82,
    open: true,
  },
  {
    key: "open-deep",
    label: "Nexus Open Deep",
    selection: { provider: "huggingface", model: "deepseek-ai/DeepSeek-V3.1" },
    roles: ["builder", "reviewer"],
    maxTokens: 12_000,
    rank: 76,
    open: true,
  },
  {
    key: "open-235",
    label: "Nexus Open 235",
    selection: { provider: "huggingface", model: "Qwen/Qwen3-235B-A22B-Instruct-2507" },
    roles: ["builder"],
    maxTokens: 12_000,
    rank: 72,
    open: true,
  },

  /* ── v20: open-source FREE tier (OpenRouter :free) — a real multi-engine
        forge even on a free account with no paid key beyond the router ── */
  {
    key: "free-q3",
    label: "Nexus Open Q3",
    selection: { provider: "openrouter", model: "qwen/qwen3.8-27b:free" },
    roles: ["builder", "repair"],
    maxTokens: 12_000,
    rank: 68,
    open: true,
    free: true,
  },
  {
    key: "free-code-mini",
    label: "Nexus OpenCode Mini",
    selection: { provider: "openrouter", model: "cohere/north-mini-code:free" },
    roles: ["builder", "repair"],
    maxTokens: 12_000,
    rank: 66,
    open: true,
    free: true,
    quick: true,
  },
  {
    key: "free-think",
    label: "Nexus Open Think",
    selection: { provider: "openrouter", model: "thinkingmachines/inkling:free" },
    roles: ["architect", "reviewer"],
    maxTokens: 10_000,
    rank: 64,
    open: true,
    free: true,
  },
  {
    key: "free-31b",
    label: "Nexus Open 31B",
    selection: { provider: "openrouter", model: "google/gemma-4-31b-it:free" },
    roles: ["builder"],
    maxTokens: 10_000,
    rank: 60,
    open: true,
    free: true,
  },
  {
    key: "free-120b",
    label: "Nexus Open 120B",
    selection: { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
    roles: ["builder", "reviewer"],
    maxTokens: 12_000,
    rank: 62,
    open: true,
    free: true,
  },
  {
    key: "free-lite",
    label: "Nexus Open Lite",
    selection: { provider: "openrouter", model: "liquid/lfm-2.5-2.6b:free" },
    roles: ["repair"],
    maxTokens: 8_000,
    rank: 48,
    open: true,
    free: true,
    quick: true,
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
  o: { system: string; prompt: string; maxTokens?: number; signal?: AbortSignal; temperature?: number; onChunk?: (d: string) => void }
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
    const text = await readAllWithSignal(stream, o.signal, o.onChunk);
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
  const text = await readAllWithSignal(stream, o.signal, o.onChunk);
  return { text, model: realModel, key: m.key, ms: Date.now() - t0 };
}

/* ------------------------------------------------------------------ *
 * v20 — real reasoning ("thinking") extraction + DUO choice
 * Pure helpers live in ./think (client-safe, unit-tested); re-exported here so
 * every existing server import keeps working unchanged.
 * ------------------------------------------------------------------ */
export { splitThink, thinkTap, hasThink, pickDuo } from "@/lib/forge/think";
import { pickDuo } from "@/lib/forge/think";

/** The two fastest reachable engines — the DUO fast path writes with exactly these. */
export function duoEngines(plan: PlanId = "free"): ForgeModel[] {
  const pool = forgePool(plan).filter((m) => m.roles.includes("builder"));
  return pickDuo(pool);
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
    /** v20 — live tokens (used to surface the engine's real reasoning) */
    onChunk?: (m: ForgeModel, d: string) => void;
  }
): Promise<ForgeAsk | null> {
  const avoid = new Set(o.avoid ?? []);
  const pool = forgeRolePool(role, o.plan).sort((a, b) => Number(avoid.has(a.key)) - Number(avoid.has(b.key)));
  let last: ForgeAsk | null = null;

  for (const m of pool) {
    if (o.signal?.aborted) return last;
    o.onTry?.(m, "start");
    try {
      const r = await askForgeModel(m, {
        system: o.system,
        prompt: o.prompt,
        maxTokens: o.maxTokens,
        signal: o.signal,
        onChunk: o.onChunk ? (d) => o.onChunk?.(m, d) : undefined,
      });
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
