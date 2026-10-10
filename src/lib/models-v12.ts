/**
 * Nexus AI v12 — the curated model line-up.
 *
 * Exactly 8 models for free accounts and 8 for Pro. Nothing else is offered
 * anywhere in the UI: no raw OpenRouter dump, no duplicated aliases, no dead ids.
 * Every entry carries a speed class and a "flagship" flag so the picker can tell
 * the user what they are choosing before they choose it.
 *
 * Client-safe: pure data, no server imports, no secrets.
 */
import type { ModelSelection, PlanId, ProviderId } from "@/lib/model-access";

/** How fast the first useful answer lands. */
export type SpeedClass = "instant" | "fast" | "balanced" | "deep";

export interface Model12 {
  /** stable key used by the UI and by localStorage */
  key: string;
  label: string;
  /** one short line in Arabic — what this model is actually for */
  blurb: string;
  provider: ProviderId;
  /** provider-specific id; "auto" = provider default */
  model: string;
  plan: PlanId;
  speed: SpeedClass;
  /** the few models we actively recommend */
  flagship?: boolean;
  /** what it is genuinely good at */
  strengths: readonly string[];
  /** rough context window, in thousands of tokens (display only) */
  ctxK: number;
}

export const SPEED_META: Record<
  SpeedClass,
  { label: string; note: string; bars: 1 | 2 | 3 | 4; tone: string }
> = {
  instant: { label: "فوري", note: "أقل من ثانية", bars: 4, tone: "#34d399" },
  fast: { label: "سريع", note: "1–3 ثوانٍ", bars: 3, tone: "#60a5fa" },
  balanced: { label: "متوازن", note: "3–8 ثوانٍ", bars: 2, tone: "#fbbf24" },
  deep: { label: "عميق", note: "بطيء — يفكّر أكثر", bars: 1, tone: "#f472b6" },
};

/* ------------------------------------------------------------------ *
 * FREE — 8 models (Gemini + open weights)
 * ------------------------------------------------------------------ */
const FREE: readonly Model12[] = [
  {
    key: "flash-2.5",
    label: "Nexus Flash",
    blurb: "المحرّك الافتراضي — جواب فوري لكل يوم.",
    provider: "gemini",
    model: "gemini-2.5-flash",
    plan: "free",
    speed: "instant",
    flagship: true,
    strengths: ["محادثة", "تلخيص", "ترجمة"],
    ctxK: 1000,
  },
  {
    key: "flash-lite",
    label: "Nexus Lite",
    blurb: "أخفّ وأسرع نموذج — للردود القصيرة.",
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    plan: "free",
    speed: "instant",
    strengths: ["ردود قصيرة", "تصنيف"],
    ctxK: 1000,
  },
  {
    key: "flash-2.0",
    label: "Nexus Flash 2.0",
    blurb: "الجيل السابق — ثابت ومجرَّب.",
    provider: "gemini",
    model: "gemini-2.0-flash",
    plan: "free",
    speed: "fast",
    strengths: ["استقرار", "مهام عامة"],
    ctxK: 1000,
  },
  {
    key: "think",
    label: "Nexus Think",
    blurb: "يفكّر قبل ما يجاوب — للمسائل الصعبة.",
    provider: "gemini",
    model: "gemini-2.5-pro",
    plan: "free",
    speed: "deep",
    flagship: true,
    strengths: ["استدلال", "رياضيات", "تحليل"],
    ctxK: 1000,
  },
  {
    key: "qwen-235b",
    label: "Qwen3 235B",
    blurb: "نموذج مفتوح ضخم — قوي بالعربية.",
    provider: "huggingface",
    model: "Qwen/Qwen3-235B-A22B-Instruct-2507",
    plan: "free",
    speed: "balanced",
    strengths: ["عربية", "كتابة طويلة"],
    ctxK: 256,
  },
  {
    key: "qwen-coder",
    label: "Qwen3 Coder 480B",
    blurb: "متخصّص فالكود — أحسن خيار مجاني للبرمجة.",
    provider: "huggingface",
    model: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    plan: "free",
    speed: "deep",
    flagship: true,
    strengths: ["برمجة", "ألعاب", "إصلاح أخطاء"],
    ctxK: 256,
  },
  {
    key: "deepseek-free",
    label: "DeepSeek V3.1",
    blurb: "استدلال قوي بتكلفة صفر.",
    provider: "huggingface",
    model: "deepseek-ai/DeepSeek-V3.1",
    plan: "free",
    speed: "balanced",
    strengths: ["استدلال", "كود"],
    ctxK: 128,
  },
  {
    key: "llama-70b",
    label: "Llama 3.3 70B",
    blurb: "مفتوح وسريع — جيّد للمحادثة.",
    provider: "huggingface",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    plan: "free",
    speed: "fast",
    strengths: ["محادثة", "تلخيص"],
    ctxK: 128,
  },
];

/* ------------------------------------------------------------------ *
 * PRO — 8 models (xAI + OpenRouter)
 * ------------------------------------------------------------------ */
const PRO: readonly Model12[] = [
  {
    key: "auto",
    label: "التوجيه الذكي",
    blurb: "نكشف نوع السؤال ونبعثوه لأنسب نموذج أوتوماتيكيًا.",
    provider: "openrouter",
    model: "openrouter/auto",
    plan: "pro",
    speed: "fast",
    flagship: true,
    strengths: ["كل المهام", "بلا اختيار يدوي"],
    ctxK: 200,
  },
  {
    key: "nexus-claude-51",
    label: "Nexus Claude 5.1",
    blurb: "دمج Claude 4.5 مع محرّكات احتياطية قوية — جودة أعلى وبلا توقف.",
    provider: "openrouter",
    model: "nexus/claude-5.1",
    plan: "pro",
    speed: "fast",
    flagship: true,
    strengths: ["كود", "كتابة", "استدلال", "ألعاب"],
    ctxK: 200,
  },
  {
    key: "nexus-kimi-code",
    label: "Kimi Code",
    blurb: "متخصّص في الكود — ملفات كاملة وسريعة.",
    provider: "openrouter",
    model: "nexus/kimi-code",
    plan: "pro",
    speed: "fast",
    flagship: true,
    strengths: ["كود", "ألعاب", "تطبيقات"],
    ctxK: 256,
  },
  {
    key: "sonnet-45",
    label: "Claude Sonnet 4.5",
    blurb: "الأقوى فالكتابة والكود الطويل.",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    plan: "pro",
    speed: "balanced",
    flagship: true,
    strengths: ["كود", "كتابة", "تحليل مستندات"],
    ctxK: 200,
  },
  {
    key: "grok-4",
    label: "Grok 4",
    blurb: "أحدث نموذج من xAI — استدلال عميق.",
    provider: "grok",
    model: "grok-4",
    plan: "pro",
    speed: "deep",
    flagship: true,
    strengths: ["استدلال", "رياضيات", "أخبار"],
    ctxK: 256,
  },
  {
    key: "gpt-4o",
    label: "GPT-4o",
    blurb: "متعدّد الوسائط وسريع.",
    provider: "openrouter",
    model: "openai/gpt-4o",
    plan: "pro",
    speed: "fast",
    strengths: ["صور", "محادثة", "أدوات"],
    ctxK: 128,
  },
  {
    key: "grok-3",
    label: "Grok 3",
    blurb: "متوازن بين السرعة والعمق.",
    provider: "grok",
    model: "grok-3",
    plan: "pro",
    speed: "balanced",
    strengths: ["عام", "كود"],
    ctxK: 131,
  },
  {
    key: "deepseek-pro",
    label: "DeepSeek V3.1",
    blurb: "أحسن نسبة جودة/سرعة فالكود.",
    provider: "openrouter",
    model: "deepseek/deepseek-chat-v3.1",
    plan: "pro",
    speed: "fast",
    strengths: ["كود", "رياضيات"],
    ctxK: 128,
  },
  {
    key: "sonnet-35",
    label: "Claude 3.5 Sonnet",
    blurb: "كلاسيكي موثوق — ردود نظيفة.",
    provider: "openrouter",
    model: "anthropic/claude-3.5-sonnet",
    plan: "pro",
    speed: "fast",
    strengths: ["كتابة", "تلخيص"],
    ctxK: 200,
  },
  {
    key: "grok-2",
    label: "Grok 2",
    blurb: "خفيف وسريع من xAI.",
    provider: "grok",
    model: "grok-2-1212",
    plan: "pro",
    speed: "instant",
    strengths: ["ردود سريعة"],
    ctxK: 131,
  },
];

/** The complete line-up — 16 models, nothing hidden, nothing extra. */
export const MODELS_V12: readonly Model12[] = [...FREE, ...PRO];

export const FREE_MODELS_V12 = FREE;
export const PRO_MODELS_V12 = PRO;

export const MODEL_BY_KEY: ReadonlyMap<string, Model12> = new Map(
  MODELS_V12.map((m) => [m.key, m])
);

export const DEFAULT_MODEL_KEY = "flash-2.5";

/** Models a given plan may actually run. */
export function modelsFor(plan: PlanId): readonly Model12[] {
  return plan === "pro" ? MODELS_V12 : FREE;
}

export function toSelection(m: Model12): ModelSelection {
  return { provider: m.provider, model: m.model };
}

/** Reverse lookup so an existing stored selection keeps working after the upgrade. */
export function fromSelection(s: ModelSelection | null | undefined): Model12 | undefined {
  if (!s) return undefined;
  const model = s.model ?? "auto";
  return MODELS_V12.find((m) => m.provider === s.provider && m.model === model);
}

export function isLocked(m: Model12, plan: PlanId): boolean {
  return m.plan === "pro" && plan !== "pro";
}

/* ------------------------------------------------------------------ *
 * Storage
 * ------------------------------------------------------------------ */
const KEY = "nexus_model_v12";

export function loadModelKey(): string {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && MODEL_BY_KEY.has(raw)) return raw;
  } catch {
    /* private mode */
  }
  return DEFAULT_MODEL_KEY;
}

export function saveModelKey(key: string): void {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    /* private mode */
  }
}
