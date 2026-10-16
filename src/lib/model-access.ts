/**
 * Model catalog + plan gating — shared by the server (chat route) and the client (selector).
 * No secrets, no server imports.
 *
 *   Free: the native engine + open-source engines
 *   Pro : everything above + the routed heavyweight engines
 */
export type ProviderId = "gemini" | "huggingface" | "grok" | "openrouter";
export type PlanId = "free" | "pro";

/** display order: routed engines first, then the native engine, then open-source */
export const PROVIDERS: readonly ProviderId[] = ["grok", "openrouter", "gemini", "huggingface"];

/** providers that need a Pro plan */
export const PRO_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>(["grok", "openrouter"]);

export interface ModelOption {
  provider: ProviderId;
  /** "auto" = the provider's default / the project's built-in routing */
  id: string;
  label: string;
  hint?: string;
}

export const MODEL_CATALOG: readonly ModelOption[] = [
  /* v20 — every engine is presented under the Nexus name. The `id` is the real
     routing target; the label/hint describe what the engine is FOR, never who
     made it (identity rule: Nexus is built by abdelrezakbezzag, Algeria 🇩🇿). */
  { provider: "grok", id: "grok-4", label: "Nexus Vector", hint: "استدلال سريع ومنطق قوي" },
  { provider: "grok", id: "grok-3", label: "Nexus Vector 3", hint: "توازن سرعة/جودة" },
  { provider: "grok", id: "grok-2-1212", label: "Nexus Vector 2", hint: "خفيف وسريع" },
  { provider: "openrouter", id: "openrouter/auto", label: "Nexus Router — يوزّع المهام", hint: "يختار أنسب محرّك لكل سؤال" },
  { provider: "openrouter", id: "anthropic/claude-sonnet-4.5", label: "Nexus Architect", hint: "أقوى محرّك للكود الطويل" },
  { provider: "openrouter", id: "openai/gpt-4o", label: "Nexus General", hint: "متعدد الوسائط" },
  { provider: "openrouter", id: "deepseek/deepseek-chat-v3.1", label: "Nexus DeepCode", hint: "كود واستدلال عميق" },
  { provider: "openrouter", id: "anthropic/claude-3.5-sonnet", label: "Nexus Architect Lite", hint: "كود دقيق وأرخص" },
  { provider: "openrouter", id: "qwen/qwen3.8-27b:free", label: "Nexus Open Q3", hint: "مفتوح المصدر · مجاني" },
  { provider: "openrouter", id: "cohere/north-mini-code:free", label: "Nexus OpenCode Mini", hint: "مفتوح المصدر · كود سريع" },
  { provider: "openrouter", id: "thinkingmachines/inkling:free", label: "Nexus Open Think", hint: "مفتوح المصدر · تفكير" },
  { provider: "openrouter", id: "nvidia/nemotron-3-super-120b-a12b:free", label: "Nexus Open 120B", hint: "مفتوح المصدر · 120B" },
  { provider: "openrouter", id: "google/gemma-4-31b-it:free", label: "Nexus Open 31B", hint: "مفتوح المصدر · 31B" },
  { provider: "gemini", id: "auto", label: "Nexus Titan", hint: "المحرّك الأصلي — مخرجات طويلة جدًا" },
  { provider: "huggingface", id: "auto", label: "Nexus Open (HF)", hint: "نماذج مفتوحة المصدر" },
];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  grok: "Nexus Vector",
  openrouter: "Nexus Router — محرّكات Pro",
  gemini: "Nexus Titan",
  huggingface: "Nexus Open — نماذج مفتوحة المصدر",
};

export interface ModelSelection {
  provider: ProviderId;
  /** undefined / "auto" = provider default */
  model?: string;
}

export const DEFAULT_SELECTION: ModelSelection = { provider: "gemini", model: "auto" };

export const isProProvider = (p: ProviderId): boolean => PRO_PROVIDERS.has(p);

const MODEL_ID_RE = /^[\w.\-]+(\/[\w.\-:]+)?$/;

/**
 * Validates provider/model coming from a request body.
 * Returns null when nothing was selected, "BAD" when the input is malformed.
 */
export function parseSelection(provider: unknown, model: unknown): ModelSelection | null | "BAD" {
  if (provider === undefined || provider === null || provider === "") return null;
  if (typeof provider !== "string" || !(PROVIDERS as readonly string[]).includes(provider)) return "BAD";
  if (model === undefined || model === null || model === "") return { provider: provider as ProviderId };
  if (typeof model !== "string" || model.length > 120 || !MODEL_ID_RE.test(model)) return "BAD";
  return { provider: provider as ProviderId, model };
}

export type AccessResult =
  | { ok: true }
  | { ok: false; status: 403; code: "PRO_MODEL_REQUIRED"; message: string; provider: ProviderId };

export const UPGRADE_MESSAGE =
  "هذا المحرّك متاح في خطة Pro — رقِّ لفتح كل محرّكات Nexus الثقيلة.";

/** The single gate used by the chat route. */
export function checkModelAccess(plan: PlanId, provider: ProviderId): AccessResult {
  if (plan !== "pro" && isProProvider(provider)) {
    return { ok: false, status: 403, code: "PRO_MODEL_REQUIRED", message: UPGRADE_MESSAGE, provider };
  }
  return { ok: true };
}

const STORAGE_KEY = "nexus_model_sel";

/** client helpers (guarded: private mode / SSR) */
export function loadSelection(): ModelSelection {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const j = JSON.parse(raw) as { provider?: unknown; model?: unknown };
      const s = parseSelection(j.provider, j.model);
      if (s && s !== "BAD") return s;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_SELECTION;
}

export function saveSelection(s: ModelSelection): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}
