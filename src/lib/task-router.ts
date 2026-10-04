/**
 * Task router: every engine gets the job it is best at.
 *
 *   Gemini     → PRIMARY: general chat, code, writing, images / PDFs, final merge
 *   Claude     → optional backup (not primary)
 *   HuggingFace→ strong open models (Qwen3-Coder, DeepSeek-V3.1)
 *   DeepSeek   → math, logic, algorithms, step-by-step verification
 *   Grok       → creative ideas, bold / witty angles, game mechanics, slogans
 *   Gemini     → backup lead, very long context, second pair of eyes for images / PDFs
 *   Groq       → ultra-fast short answers
 *   OpenRouter → free safety net + independent second opinion
 *
 * Set BARQ_ROUTING=off to go back to one fixed order.
 */

export type Task = "code" | "reasoning" | "creative" | "vision" | "writing" | "quick" | "general";
export type EngineName = "gemini" | "claude" | "deepseek" | "grok" | "huggingface" | "openrouter" | "groq" | "cerebras";

export const TASK_LABEL_AR: Record<Task, string> = {
  code: "برمجة",
  reasoning: "منطق ورياضيات",
  creative: "إبداع",
  vision: "صور وملفات",
  writing: "كتابة وترجمة",
  quick: "رد سريع",
  general: "عام",
};

/**
 * Best engine first. Gemini leads general work, code, writing and images; DeepSeek leads
 * math/logic, Grok leads creative work, Groq leads instant short replies. Claude is a backup.
 * Only engines that have a key take part: the first one in this list that exists leads.
 */
const ORDER: Record<Task, EngineName[]> = {
  code: ["gemini", "cerebras", "deepseek", "huggingface", "grok", "claude", "openrouter", "groq"],
  reasoning: ["deepseek", "gemini", "huggingface", "grok", "claude", "openrouter", "groq", "cerebras"],
  creative: ["grok", "gemini", "huggingface", "deepseek", "claude", "openrouter", "groq", "cerebras"],
  vision: ["gemini", "claude", "openrouter", "grok", "deepseek", "huggingface", "groq", "cerebras"],
  writing: ["gemini", "grok", "huggingface", "deepseek", "claude", "openrouter", "groq", "cerebras"],
  quick: ["groq", "cerebras", "gemini", "grok", "deepseek", "huggingface", "claude", "openrouter"],
  general: ["gemini", "grok", "deepseek", "huggingface", "claude", "openrouter", "groq", "cerebras"],
};

export const routingEnabled = () => (process.env.BARQ_ROUTING ?? "").trim().toLowerCase() !== "off";

/** Engine preference for a task (falls back to the fixed order when routing is off). */
export function engineOrder(task: Task | undefined): EngineName[] {
  return routingEnabled() && task ? ORDER[task] : ORDER.general;
}

/** One-line specialty, in Arabic, for the progress banner. */
export const SPECIALTY_AR: Record<EngineName, string> = {
  claude: "احتياط: كود وكتابة",
  huggingface: "نماذج مفتوحة قوية للكود",
  deepseek: "منطق وخوارزميات",
  grok: "أفكار إبداعية",
  gemini: "الأساسي: كود وكتابة ودمج وصور",
  groq: "سرعة",
  cerebras: "سرعة فائقة في الكود والتصحيح",
  openrouter: "رأي ثانٍ ومراجعة",
};

const ROLE: Record<EngineName, string> = {
  claude:
    "YOUR SPECIALTY: you are the strongest all-rounder: clean architecture, correctness and excellent writing. Produce complete, production-ready code with sound structure, careful handling of existing code (keep every current feature) and clear naming.",
  deepseek:
    "YOUR SPECIALTY: algorithms, math and strict logic. Verify every step, complexity, edge case and number; prefer the simplest correct algorithm and say nothing you have not checked.",
  grok:
    "YOUR SPECIALTY: originality. Bring bold, fresh ideas, memorable mechanics / copy / UX details and a distinctive angle that the other engineers would not think of, without sacrificing correctness.",
  gemini:
    "YOUR SPECIALTY: very long context and broad world knowledge, plus multilingual (especially Arabic / Algerian Darija) polish. Use any attached image or PDF to the fullest.",
  huggingface:
    "YOUR SPECIALTY: strong open-weight coding models. Write clean, complete, working code and double-check edge cases.",
  cerebras:
    "YOUR SPECIALTY: very fast code and debugging. Deliver compact, correct, working code and fix bugs precisely without padding.",
  groq:
    "YOUR SPECIALTY: speed and focus. Deliver a tight, solid, correct baseline answer without padding.",
  openrouter:
    "YOUR ROLE: independent second opinion. Solve it your own way and be especially careful about the mistakes other engineers are likely to make.",
};

/** Extra system text that tells an engine what it is the specialist for. */
export function roleFor(engine: EngineName, task: Task | undefined): string {
  if (!routingEnabled()) return "";
  const lead = task && ORDER[task][0] === engine ? " You are the PRIMARY expert for this kind of task: take the hardest part." : "";
  return `\n\n${ROLE[engine]}${lead}`;
}

/** Reorders providers (anything with a `name`) by the task's engine preference. */
export function sortByTask<T extends { name: string }>(list: T[], task: Task | undefined): T[] {
  const order = engineOrder(task);
  const rank = (n: string) => {
    const i = order.indexOf(n as EngineName);
    return i < 0 ? 99 : i;
  };
  return [...list].sort((a, b) => rank(a.name) - rank(b.name));
}

/* ---------- classification ---------- */

const RE_CODE =
  /```|function\s*\(|=>|<\/?[a-z][\w-]*[^>]*>|\bSELECT\b|\bimport\s+\w|\bdef\s+\w+\(|\bclass\s+\w+|#include|\bconst\s+\w+\s*=|(كود|برمج|سكريبت|سكربت|دالة|قاعدة بيانات|\bapi\b|\bsql\b|regex|\bbug\b|خطأ في|لعب[ةه]|موقع|تطبيق|\bcode\b|script|function|backend|frontend|component|react|next\.?js|python|java|c\+\+|php|flutter|kotlin|swift|typescript|javascript|node|docker|\bgit\b|html|css)/i;
const RE_REASON =
  /(معادل[ةه]|رياضي|حساب|احسب|برهن|أثبت|مسأل[ةه]|مسألة|احتمال|مشتق|تكامل|منطق|لغز|خوارزمي|تعقيد|\bprove\b|\bsolve\b|equation|probability|derivative|integral|calculate|puzzle|logic|algorithm|complexity|olympiad|أولمبياد|physique|math[ée]matiques|calcule|résous)/i;
const RE_CREATIVE =
  /(قص[ةه]|حكاي[ةه]|شعر|قصيد[ةه]|نكت[ةه]|فكر[ةه]|أفكار|اسم|شعار|إعلان|حمل[ةه]|تسويق|سلوغان|ابتكر|إبداع|خيال|\bstory\b|poem|joke|slogan|brand|name ideas|brainstorm|creative|idea|tagline|campaign|histoire|po[eè]me|blague|id[ée]e)/i;
const RE_WRITING =
  /(ترجم|ترجمة|لخّ?ص|تلخيص|مقال|تقرير|رسال[ةه]|إيميل|بريد|بحث|مذكر[ةه]|صحح|صحّح|أعد صياغة|translate|summari[sz]e|summary|essay|report|email|letter|proofread|rewrite|paraphrase|traduis|résume|rédige)/i;

/**
 * Picks the task type from the user's message.
 * `hasMedia` = an image / PDF is attached (only Gemini and Claude can read those).
 */
export function classifyTask(text: string, hasMedia = false): Task {
  const t = (text ?? "").trim();
  if (hasMedia) return "vision";
  if (RE_REASON.test(t) && !/```/.test(t)) return "reasoning";
  if (RE_CODE.test(t) && t.length >= 12) return "code";
  if (RE_CREATIVE.test(t)) return "creative";
  if (RE_WRITING.test(t)) return "writing";
  if (t.length > 0 && t.length <= 60) return "quick";
  return "general";
}
