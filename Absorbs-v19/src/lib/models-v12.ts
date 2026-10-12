/**
 * Nexus AI v18 — ATLAS model line-up.
 *
 * The catalogue is curated on purpose: no raw OpenRouter dump, no duplicated
 * aliases, no dead ids. Every entry tells the user what the model is for, how
 * fast it answers, how heavy it is, and — since v18 — carries its OWN persona
 * (a long operating contract injected into the system prompt by the router).
 *
 *   Free : Gemini + Hugging Face open weights (ultra-light to deep)
 *   Pro  : everything above + Grok (xAI) + OpenRouter flagships
 *          (GPT-5 · Astra · Kimi K2 · Claude · Gemini Pro · Qwen Max …)
 *
 * Client-safe: pure data + prompt strings, no server imports, no secrets.
 */
import type { ModelSelection, PlanId, ProviderId } from "@/lib/model-access";
import { PERSONAS_V18, personaFor } from "@/lib/personas-v18";

/** How fast the first useful answer lands. */
export type SpeedClass = "instant" | "fast" | "balanced" | "deep";

/** How heavy the model is — drives the "light model" filter in the picker. */
export type WeightClass = "ultralight" | "light" | "balanced" | "heavy";

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
  /** how heavy / expensive it is to run */
  weight: WeightClass;
  /** the few models we actively recommend */
  flagship?: boolean;
  /** what it is genuinely good at */
  strengths: readonly string[];
  /** rough context window, in thousands of tokens (display only) */
  ctxK: number;
  /** v18: short family tag shown as a chip (GPT · Astra · Kimi · Claude …) */
  family: string;
  /** v18: the operating contract appended to the system prompt by the router */
  persona?: string;
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

export const WEIGHT_META: Record<
  WeightClass,
  { label: string; note: string; tone: string; rank: number }
> = {
  ultralight: { label: "خفيف جداً", note: "أقل استهلاكاً — مثالي للجوال", tone: "#34d399", rank: 0 },
  light: { label: "خفيف", note: "سريع واقتصادي", tone: "#7dd3fc", rank: 1 },
  balanced: { label: "متوازن", note: "جودة وسرعة", tone: "#fbbf24", rank: 2 },
  heavy: { label: "ثقيل", note: "أقصى جودة — أبطأ", tone: "#f472b6", rank: 3 },
};

/* ------------------------------------------------------------------ *
 * FREE — 12 models (Gemini + open weights), from ultra-light to deep
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
    weight: "ultralight",
    flagship: true,
    strengths: ["محادثة", "تلخيص", "ترجمة"],
    ctxK: 1000,
    family: "Gemini",
    persona: personaFor("flash-2.5"),
  },
  {
    key: "flash-lite",
    label: "Nexus Lite",
    blurb: "أخفّ وأسرع نموذج — للردود القصيرة.",
    provider: "gemini",
    model: "gemini-2.5-flash-lite",
    plan: "free",
    speed: "instant",
    weight: "ultralight",
    strengths: ["ردود قصيرة", "تصنيف"],
    ctxK: 1000,
    family: "Gemini",
    persona: personaFor("flash-lite"),
  },
  {
    key: "flash-2.0",
    label: "Nexus Flash 2.0",
    blurb: "الجيل السابق — ثابت ومجرَّب.",
    provider: "gemini",
    model: "gemini-2.0-flash",
    plan: "free",
    speed: "fast",
    weight: "light",
    strengths: ["استقرار", "مهام عامة"],
    ctxK: 1000,
    family: "Gemini",
    persona: personaFor("flash-2.0"),
  },
  {
    key: "think",
    label: "Nexus Think",
    blurb: "يفكّر قبل ما يجاوب — للمسائل الصعبة.",
    provider: "gemini",
    model: "gemini-2.5-pro",
    plan: "free",
    speed: "deep",
    weight: "heavy",
    flagship: true,
    strengths: ["استدلال", "رياضيات", "تحليل"],
    ctxK: 1000,
    family: "Gemini",
    persona: personaFor("think"),
  },
  {
    key: "qwen-235b",
    label: "Qwen3 235B",
    blurb: "نموذج مفتوح ضخم — قوي بالعربية.",
    provider: "huggingface",
    model: "Qwen/Qwen3-235B-A22B-Instruct-2507",
    plan: "free",
    speed: "balanced",
    weight: "balanced",
    strengths: ["عربية", "كتابة طويلة"],
    ctxK: 256,
    family: "Qwen",
    persona: personaFor("qwen-235b"),
  },
  {
    key: "qwen-coder",
    label: "Qwen3 Coder 480B",
    blurb: "متخصّص فالكود — أحسن خيار مجاني للبرمجة.",
    provider: "huggingface",
    model: "Qwen/Qwen3-Coder-480B-A35B-Instruct",
    plan: "free",
    speed: "deep",
    weight: "heavy",
    flagship: true,
    strengths: ["برمجة", "ألعاب", "إصلاح أخطاء"],
    ctxK: 256,
    family: "Qwen",
    persona: personaFor("qwen-coder"),
  },
  {
    key: "deepseek-free",
    label: "DeepSeek V3.1",
    blurb: "استدلال قوي بتكلفة صفر.",
    provider: "huggingface",
    model: "deepseek-ai/DeepSeek-V3.1",
    plan: "free",
    speed: "balanced",
    weight: "balanced",
    strengths: ["استدلال", "كود"],
    ctxK: 128,
    family: "DeepSeek",
    persona: personaFor("deepseek-free"),
  },
  {
    key: "llama-70b",
    label: "Llama 3.3 70B",
    blurb: "مفتوح وسريع — جيّد للمحادثة.",
    provider: "huggingface",
    model: "meta-llama/Llama-3.3-70B-Instruct",
    plan: "free",
    speed: "fast",
    weight: "light",
    strengths: ["محادثة", "تلخيص"],
    ctxK: 128,
    family: "Llama",
    persona: personaFor("llama-70b"),
  },
  /* ---- v18: four new ultra-light open models ---- */
  {
    key: "qwen3-30b",
    label: "Qwen3 30B Light",
    blurb: "نموذج فائق الخفّة — جواب سريع باستهلاك قليل.",
    provider: "huggingface",
    model: "Qwen/Qwen3-30B-A3B-Instruct-2507",
    plan: "free",
    speed: "instant",
    weight: "ultralight",
    strengths: ["سرعة", "موبايل", "مسودات"],
    ctxK: 128,
    family: "Qwen",
    persona: personaFor("llama-70b"),
  },
  {
    key: "gemma-3-27b",
    label: "Gemma 3 27B",
    blurb: "خفيف ونظيف — ممتاز للشرح والتلخيص.",
    provider: "huggingface",
    model: "google/gemma-3-27b-it",
    plan: "free",
    speed: "fast",
    weight: "ultralight",
    strengths: ["تلخيص", "شرح", "ترجمة"],
    ctxK: 128,
    family: "Gemma",
    persona: personaFor("flash-2.0"),
  },
  {
    key: "llama-4-scout",
    label: "Llama 4 Scout",
    blurb: "جيل جديد مفتوح — متعدّد اللغات وخفيف.",
    provider: "huggingface",
    model: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    plan: "free",
    speed: "fast",
    weight: "light",
    strengths: ["متعدد اللغات", "محادثة"],
    ctxK: 256,
    family: "Llama",
    persona: personaFor("llama-70b"),
  },
  {
    key: "mistral-small",
    label: "Mistral Small 24B",
    blurb: "دقّة أوروبية وخفّة — ممتاز للفرنسية.",
    provider: "huggingface",
    model: "mistralai/Mistral-Small-24B-Instruct-2501",
    plan: "free",
    speed: "fast",
    weight: "light",
    strengths: ["فرنسية", "تحرير", "تلخيص"],
    ctxK: 128,
    family: "Mistral",
    persona: personaFor("mistral"),
  },
];

/* ------------------------------------------------------------------ *
 * PRO — 20 models (xAI + OpenRouter flagships)
 * ------------------------------------------------------------------ */
const PRO: readonly Model12[] = [
  {
    key: "gpt-astra",
    label: "GPT-6 Astra",
    blurb: "أحدث نموذج من OpenAI — استدلال عميق وكود قوي وأدوات متعددة.",
    provider: "openai",
    model: "gpt-6-astra",
    plan: "pro",
    speed: "balanced",
    weight: "heavy",
    flagship: true,
    strengths: ["استدلال", "كود", "وكلاء وأدوات", "ألعاب"],
    ctxK: 256,
    family: "Astra",
    persona: personaFor("gpt-astra"),
  },
  {
    key: "auto",
    label: "التوجيه الذكي",
    blurb: "نكشف نوع السؤال ونبعثوه لأنسب نموذج أوتوماتيكيًا.",
    provider: "openrouter",
    model: "openrouter/auto",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    flagship: true,
    strengths: ["كل المهام", "بلا اختيار يدوي"],
    ctxK: 200,
    family: "Nexus",
    persona: personaFor("auto"),
  },
  {
    key: "astra",
    label: "Nexus Astra",
    blurb: "الرائد متعدد الوسائط — يقرأ الصور والملفات ويبني واجهات كاملة.",
    provider: "openrouter",
    model: "nexus/astra",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    flagship: true,
    strengths: ["صور", "واجهات", "بناء", "عربي"],
    ctxK: 1000,
    family: "Astra",
    persona: personaFor("astra"),
  },
  {
    key: "kimi-k2",
    label: "Kimi K2",
    blurb: "مهندس المشاريع الطويلة — ملفات كاملة بلا نقص.",
    provider: "openrouter",
    model: "moonshotai/kimi-k2",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    flagship: true,
    strengths: ["كود", "ألعاب", "تطبيقات", "سياق طويل"],
    ctxK: 256,
    family: "Kimi",
    persona: personaFor("kimi-k2"),
  },
  {
    key: "kimi-3",
    label: "Kimi 3",
    blurb: "أحدث جيل من Kimi — تفكير عميق ومشاريع ضخمة بلا توقف.",
    provider: "openrouter",
    model: "nexus/kimi-3",
    plan: "pro",
    speed: "deep",
    weight: "heavy",
    flagship: true,
    strengths: ["خوارزميات", "مشاريع كاملة", "تصحيح أخطاء", "رياضيات"],
    ctxK: 256,
    family: "Kimi",
    persona: personaFor("kimi-k2-think"),
  },
  {
    key: "nexus-kimi-code",
    label: "Nexus Kimi Code",
    blurb: "متخصّص في الكود — ملفات كاملة وسريعة.",
    provider: "openrouter",
    model: "nexus/kimi-code",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    flagship: true,
    strengths: ["كود", "ألعاب", "تطبيقات"],
    ctxK: 256,
    family: "Kimi",
    persona: personaFor("nexus-kimi-code"),
  },
  {
    key: "gpt-5",
    label: "GPT-5",
    blurb: "أقوى نماذج OpenAI — تخطيط وكتابة وبناء.",
    provider: "openrouter",
    model: "openai/gpt-5",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    flagship: true,
    strengths: ["كتابة", "تخطيط", "كود", "بيانات"],
    ctxK: 400,
    family: "GPT",
    persona: personaFor("gpt-5"),
  },
  {
    key: "gpt-5-mini",
    label: "GPT-5 Mini",
    blurb: "نسخة خفيفة وسريعة من GPT-5 للمهام اليومية.",
    provider: "openrouter",
    model: "openai/gpt-5-mini",
    plan: "pro",
    speed: "instant",
    weight: "ultralight",
    strengths: ["سرعة", "محادثة", "تلخيص"],
    ctxK: 400,
    family: "GPT",
    persona: personaFor("gpt-5-mini"),
  },
  {
    key: "gpt-4o",
    label: "GPT-4o",
    blurb: "متعدّد الوسائط وسريع.",
    provider: "openrouter",
    model: "openai/gpt-4o",
    plan: "pro",
    speed: "fast",
    weight: "light",
    strengths: ["صور", "محادثة", "أدوات"],
    ctxK: 128,
    family: "GPT",
    persona: personaFor("gpt-4o"),
  },
  {
    key: "sonnet-45",
    label: "Claude Sonnet 4.5",
    blurb: "الأقوى فالكتابة والكود الطويل.",
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    plan: "pro",
    speed: "balanced",
    weight: "balanced",
    flagship: true,
    strengths: ["كود", "كتابة", "تحليل مستندات"],
    ctxK: 200,
    family: "Claude",
    persona: personaFor("claude-sonnet-45"),
  },
  {
    key: "claude-opus-41",
    label: "Claude Opus 4.1",
    blurb: "الأعمق في التحليل والكتابة الطويلة جدًا.",
    provider: "openrouter",
    model: "anthropic/claude-opus-4.1",
    plan: "pro",
    speed: "deep",
    weight: "heavy",
    strengths: ["كتب", "تقارير", "تحليل عميق"],
    ctxK: 200,
    family: "Claude",
    persona: personaFor("claude-opus-41"),
  },
  {
    key: "nexus-claude-51",
    label: "Nexus Claude 5.1",
    blurb: "دمج Claude 4.5 مع محرّكات احتياطية قوية — جودة أعلى وبلا توقف.",
    provider: "openrouter",
    model: "nexus/claude-5.1",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    flagship: true,
    strengths: ["كود", "كتابة", "استدلال", "ألعاب"],
    ctxK: 200,
    family: "Claude",
    persona: personaFor("nexus-claude-51"),
  },
  {
    key: "grok-4",
    label: "Grok 4",
    blurb: "أحدث نموذج من xAI — استدلال عميق.",
    provider: "grok",
    model: "grok-4",
    plan: "pro",
    speed: "deep",
    weight: "heavy",
    flagship: true,
    strengths: ["استدلال", "رياضيات", "أخبار"],
    ctxK: 256,
    family: "Grok",
    persona: personaFor("grok-4"),
  },
  {
    key: "grok-4-fast",
    label: "Grok 4.1 Fast",
    blurb: "سرعة Grok 4 بوزن أخفّ — للمحادثة السريعة.",
    provider: "grok",
    model: "grok-4-1-fast",
    plan: "pro",
    speed: "instant",
    weight: "light",
    strengths: ["سرعة", "محادثة", "أخبار"],
    ctxK: 256,
    family: "Grok",
    persona: personaFor("grok-4-fast"),
  },
  {
    key: "grok-3",
    label: "Grok 3",
    blurb: "متوازن بين السرعة والعمق.",
    provider: "grok",
    model: "grok-3",
    plan: "pro",
    speed: "balanced",
    weight: "balanced",
    strengths: ["عام", "كود"],
    ctxK: 131,
    family: "Grok",
    persona: personaFor("grok-3"),
  },
  {
    key: "grok-2",
    label: "Grok 2",
    blurb: "خفيف وسريع من xAI.",
    provider: "grok",
    model: "grok-2-1212",
    plan: "pro",
    speed: "instant",
    weight: "ultralight",
    strengths: ["ردود سريعة"],
    ctxK: 131,
    family: "Grok",
    persona: personaFor("grok-2"),
  },
  {
    key: "gemini-pro",
    label: "Gemini 2.5 Pro",
    blurb: "سياق طويل جدًا — مستندات ضخمة وذاكرة محادثة.",
    provider: "openrouter",
    model: "google/gemini-2.5-pro",
    plan: "pro",
    speed: "balanced",
    weight: "heavy",
    strengths: ["مستندات", "دراسة", "سياق طويل"],
    ctxK: 1000,
    family: "Gemini",
    persona: personaFor("gemini-pro"),
  },
  {
    key: "qwen-max",
    label: "Qwen3 Max",
    blurb: "أقوى نسخة عربية من Qwen — كتابة طويلة.",
    provider: "openrouter",
    model: "qwen/qwen3-max",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    strengths: ["عربية", "كتابة", "شعر"],
    ctxK: 256,
    family: "Qwen",
    persona: personaFor("qwen-max"),
  },
  {
    key: "deepseek-pro",
    label: "DeepSeek V3.1",
    blurb: "أحسن نسبة جودة/سرعة فالكود.",
    provider: "openrouter",
    model: "deepseek/deepseek-chat-v3.1",
    plan: "pro",
    speed: "fast",
    weight: "light",
    strengths: ["كود", "رياضيات"],
    ctxK: 128,
    family: "DeepSeek",
    persona: personaFor("deepseek-pro"),
  },
  {
    key: "llama-4",
    label: "Llama 4 Maverick",
    blurb: "مفتوح كبير — محادثة طبيعية متعددة اللغات.",
    provider: "openrouter",
    model: "meta-llama/llama-4-maverick",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    strengths: ["محادثة", "إبداع"],
    ctxK: 1000,
    family: "Llama",
    persona: personaFor("llama-4"),
  },
  {
    key: "mistral",
    label: "Mistral Large",
    blurb: "دقة أوروبية — فرنسية وإدارية بلا أخطاء.",
    provider: "openrouter",
    model: "mistralai/mistral-large",
    plan: "pro",
    speed: "fast",
    weight: "balanced",
    strengths: ["فرنسية", "وثائق", "ترجمة"],
    ctxK: 128,
    family: "Mistral",
    persona: personaFor("mistral"),
  },
  {
    key: "sonnet-35",
    label: "Claude 3.5 Sonnet",
    blurb: "كلاسيكي موثوق — ردود نظيفة.",
    provider: "openrouter",
    model: "anthropic/claude-3.5-sonnet",
    plan: "pro",
    speed: "fast",
    weight: "light",
    strengths: ["كتابة", "تلخيص"],
    ctxK: 200,
    family: "Claude",
    persona: personaFor("claude-sonnet-45"),
  },
];

/** The complete line-up — 32 models, nothing hidden, nothing extra. */
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

/** v18: only the light / ultra-light models — the "نماذج خفيفة" filter. */
export function lightModels(plan: PlanId): readonly Model12[] {
  return modelsFor(plan).filter((m) => m.weight === "ultralight" || m.weight === "light");
}

/** v18: the heavy hitters — deep reasoning, big builds. */
export function heavyModels(plan: PlanId): readonly Model12[] {
  return modelsFor(plan).filter((m) => m.weight === "heavy");
}

/** v18: every distinct model family, for the picker's filter chips. */
export function modelFamilies(plan: PlanId): readonly string[] {
  return [...new Set(modelsFor(plan).map((m) => m.family))];
}

export function toSelection(m: Model12): ModelSelection {
  return { provider: m.provider, model: m.model };
}

/** Reverse lookup so an existing stored selection keeps working after the upgrade. */
export function fromSelection(s: ModelSelection | null | undefined): Model12 | undefined {
  if (!s) return undefined;
  const model = s.model ?? "auto";
  return (
    MODELS_V12.find((m) => m.provider === s.provider && m.model === model) ??
    /* loose fallback: match on the model id alone (providers get re-mapped) */
    MODELS_V12.find((m) => m.model === model)
  );
}

/** v18: persona of a selection — used by the router when no key is known. */
export function personaForSelection(s: ModelSelection | null | undefined): string {
  return fromSelection(s)?.persona ?? "";
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

/** Re-exported so callers can reach the raw persona map without a second import. */
export { PERSONAS_V18 };
