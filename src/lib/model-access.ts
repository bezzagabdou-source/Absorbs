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
  { provider: "openrouter", id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5", hint: "كود + تفكير عميق" },
  { provider: "openrouter", id: "anthropic/claude-opus-4.1", label: "Claude Opus 4.1", hint: "أقوى بناء ومشاريع ضخمة" },
  { provider: "openrouter", id: "openai/gpt-5", label: "GPT-5", hint: "استدلال عام" },
  { provider: "openrouter", id: "openai/gpt-4o", label: "GPT-4o", hint: "سريع + رؤية" },
  { provider: "openrouter", id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", hint: "سياق ضخم" },
  { provider: "openrouter", id: "deepseek/deepseek-chat-v3.1", label: "DeepSeek V3.1", hint: "كود واقتصادي" },
  { provider: "openrouter", id: "deepseek/deepseek-r1", label: "DeepSeek R1", hint: "رياضيات ومنطق" },
  { provider: "openrouter", id: "qwen/qwen3-coder", label: "Qwen3 Coder", hint: "برمجة مفتوحة المصدر" },
  { provider: "openrouter", id: "x-ai/grok-4-fast", label: "Grok 4 Fast", hint: "رد فوري" },
  { provider: "openrouter", id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", hint: "متعدد اللغات" },
  { provider: "openrouter", id: "mistralai/mistral-large", label: "Mistral Large", hint: "أوروبي متعدد اللغات" },
  { provider: "openrouter", id: "deepseek/deepseek-chat-v3.1:free", label: "DeepSeek V3.1 (مجاني)", hint: "free tier" },
  { provider: "openrouter", id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (مجاني)", hint: "free tier" },
  { provider: "openrouter", id: "qwen/qwen2.5-vl-72b-instruct:free", label: "Qwen2.5 VL 72B (مجاني)", hint: "free tier + رؤية" },
  { provider: "gemini", id: "auto", label: "Gemini", hint: "Google Gemini" },
  { provider: "huggingface", id: "auto", label: "Open models", hint: "Hugging Face" },
];

/**
 * Task roster — every heavy task is routed to the model that is objectively best
 * at it (and each entry has two fallbacks, so one provider being down never
 * breaks a request).
 */
export type TaskId =
  | "code"
  | "game"
  | "design"
  | "math"
  | "reasoning"
  | "writing"
  | "vision"
  | "translate"
  | "fast"
  | "general";

export const TASK_ROSTER: Record<TaskId, readonly string[]> = {
  code: ["anthropic/claude-sonnet-4.5", "qwen/qwen3-coder", "deepseek/deepseek-chat-v3.1"],
  game: ["anthropic/claude-opus-4.1", "anthropic/claude-sonnet-4.5", "openai/gpt-5"],
  design: ["anthropic/claude-sonnet-4.5", "openai/gpt-5", "google/gemini-2.5-pro"],
  math: ["deepseek/deepseek-r1", "openai/gpt-5", "google/gemini-2.5-pro"],
  reasoning: ["openai/gpt-5", "anthropic/claude-sonnet-4.5", "deepseek/deepseek-r1"],
  writing: ["anthropic/claude-sonnet-4.5", "openai/gpt-5", "mistralai/mistral-large"],
  vision: ["google/gemini-2.5-pro", "openai/gpt-4o", "qwen/qwen2.5-vl-72b-instruct:free"],
  translate: ["google/gemini-2.5-pro", "meta-llama/llama-4-maverick", "openai/gpt-4o"],
  fast: ["x-ai/grok-4-fast", "openai/gpt-4o", "deepseek/deepseek-chat-v3.1"],
  general: ["openrouter/auto", "anthropic/claude-sonnet-4.5", "openai/gpt-5"],
};

/** Picks the task for a raw user message (cheap heuristics, language-agnostic). */
export function detectTask(text: string): TaskId {
  const t = text.toLowerCase();
  if (/(لعبة|العاب|ألعاب|game|arcade|platformer)/.test(t)) return "game";
  if (/(كود|برمج|سكربت|دالة|باغ|خطأ برمجي|code|bug|refactor|api|function|class |sql|regex)/.test(t)) return "code";
  if (/(تصميم|واجهة|لوجو|شعار|ui|ux|landing|wallpaper|design)/.test(t)) return "design";
  if (/(رياضيات|معادلة|احسب|math|equation|integral|probability|\d+\s*[\^+\-*/]\s*\d+)/.test(t)) return "math";
  if (/(ترجم|translate|traduis|بالانجليزية|بالفرنسية)/.test(t)) return "translate";
  if (/(اكتب|مقال|قصة|رسالة|ايميل|write|essay|story|post|cv)/.test(t)) return "writing";
  if (/(حلل|قارن|استراتيجية|analyse|analyze|compare|strategy|why)/.test(t)) return "reasoning";
  if (t.length < 60) return "fast";
  return "general";
}

/** Ordered model ids to try for a task (first = leader). */
export const modelsForTask = (task: TaskId): readonly string[] => TASK_ROSTER[task] ?? TASK_ROSTER.general;

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
export function checkModelAccess(plan: PlanId, provider: ProviderId, model?: string): AccessResult {
  // free accounts may still use OpenRouter's ":free" models (no cost, no gate)
  if (plan !== "pro" && provider === "openrouter" && typeof model === "string" && model.endsWith(":free")) {
    return { ok: true };
  }
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
