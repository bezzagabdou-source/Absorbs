/**
 * Model catalog + plan gating — shared by the server (chat route) and the client (selector).
 * No secrets, no server imports.
 *
 *   Free: Gemini + Hugging Face (open models)
 *   Pro : everything above + Grok (xAI) + OpenRouter models
 */
export type ProviderId = "gemini" | "huggingface" | "grok" | "openrouter";
export type PlanId = "free" | "pro";

/** display order: Grok first, then OpenRouter, then Gemini, then open models */
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
  { provider: "grok", id: "grok-4", label: "Grok 4", hint: "xAI" },
  { provider: "grok", id: "grok-3", label: "Grok 3", hint: "xAI" },
  { provider: "grok", id: "grok-2-1212", label: "Grok 2", hint: "xAI" },
  { provider: "openrouter", id: "openrouter/auto", label: "OpenRouter Auto — يوزّع المهام", hint: "يختار أنسب نموذج لكل سؤال" },
  { provider: "openrouter", id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", hint: "via OpenRouter" },
  { provider: "openrouter", id: "openai/gpt-4o", label: "GPT-4o", hint: "via OpenRouter" },
  { provider: "openrouter", id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", hint: "via OpenRouter" },
  { provider: "openrouter", id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet", hint: "via OpenRouter" },
  { provider: "gemini", id: "auto", label: "Gemini", hint: "Google Gemini" },
  { provider: "huggingface", id: "auto", label: "Open models", hint: "Hugging Face" },
];

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  grok: "Grok (xAI)",
  openrouter: "OpenRouter — Pro models",
  gemini: "Gemini",
  huggingface: "Open models (Hugging Face)",
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
  "This model is available on the Pro plan. Upgrade to unlock Grok and OpenRouter models (Claude, GPT-4o and more).";

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
