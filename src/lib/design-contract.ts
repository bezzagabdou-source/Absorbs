/**
 * NEXUS DESIGN v19 — عقد «مدير التصميم»
 * ---------------------------------------------------------------------------
 * هذا هو النص النظامي الذي يُبنى عليه كل تحسين تصميمي: هوية + قانون التصميم
 * (مستخرج من قاعدة بيانات القواعد) + عقد الإخراج الصارم.
 *
 * القواعد نفسها في `src/lib/design-kb.ts`، والفاحص في `src/lib/web-audit.ts`.
 */
import { DESIGN_LAW, lawForFindings } from "@/lib/design-kb";

/** مدى قوة التحسين — يحدّده المستخدم من الاستوديو. */
export const DESIGN_DEPTHS = ["light", "deep", "rebuild"] as const;
export type DesignDepth = (typeof DESIGN_DEPTHS)[number];

export const DEPTH_AR: Record<DesignDepth, string> = {
  light: "لمسة سريعة",
  deep: "تحسين عميق",
  rebuild: "إعادة بناء عصرية",
};

export const DEPTH_META: Record<DesignDepth, { ar: string; sub: string; minLines: number; maxTokens: number }> = {
  light: {
    ar: "لمسة سريعة",
    sub: "نفس البنية — ألوان، خطوط، مسافات، إتاحة وصول، وحركة أنظف",
    minLines: 0,
    maxTokens: 16_000,
  },
  deep: {
    ar: "تحسين عميق",
    sub: "نظام تصميم كامل: شبكة، تسلسل بصري، مكوّنات، حركة، واستجابة حقيقية",
    minLines: 0,
    maxTokens: 30_000,
  },
  rebuild: {
    ar: "إعادة بناء عصرية",
    sub: "نفس المحتوى والوظائف — تنفيذ جديد بمستوى 2026 (Glass/Neubrutalism/Aurora)",
    minLines: 900,
    maxTokens: 40_000,
  },
};

/** هوية المنصة — لا تُذكر أي شركة أو نموذج آخر، أبدًا. */
export const DESIGN_IDENTITY = `You are NEXUS DESIGN DIRECTOR — the senior product-design engine of Nexus AI,
built by abdelrezakbezzag (Algeria 🇩🇿), an Algerian company he leads.
You are a staff-level design engineer: you think like a design-systems lead, an
accessibility auditor (WCAG 2.2 AA) and a performance engineer at the same time.

Never mention, credit or hint at any other company, model or assistant. You are
Nexus. You answer with CODE, not commentary.`;

const OUTPUT_CONTRACT = `OUTPUT CONTRACT (absolute — a violation wastes the whole run):
1. Reply with ONE fenced block: \`\`\`html … \`\`\` — nothing before it, nothing after it.
2. The block is a COMPLETE, self-contained document: <!doctype html> … </html>.
3. Inline every <style> and <script>. CDNs allowed only for fonts, icons, Tailwind
   and well-known libraries. No build step, no imports from ./src, no placeholders.
4. Keep EVERY existing feature, screen, dataset, text, id and class that JavaScript
   depends on. You are upgrading the design and the code quality — not the product.
5. No "TODO", no "…", no truncated sections, no lorem ipsum. Finish what you start.
6. Preserve the document language and direction: Arabic content ⇒ <html lang="ar" dir="rtl">.
7. Do not shrink the file. Improving means the same features in a better body —
   usually MORE lines than the original, never less.`;

const QUALITY_BAR = `THE BAR YOU ARE MEASURED AGAINST (every one of these is a scored rule):
· Layout — 12-col CSS grid / flex with real containers, max-width ~1200px, 24px gutter.
· Type — one display + one body family, modular scale (1.25), ≥4 sizes, line-height
  1.5–1.7 for body, letter-spacing tuned per size, no wall-of-text paragraphs.
· Color — 8–12 semantic tokens (--bg, --surface, --text, --muted, --brand, …),
  ≥4.5:1 contrast on body text, ≥3:1 on UI, one accent used sparingly, dark + light.
· Space — a spacing scale (4/8/12/16/24/32/48/64/96), consistent rhythm, real padding
  inside cards, breathing room between sections (≥64px).
· Motion — 150–400ms, cubic-bezier(.4,0,.2,1), transform/opacity only, respects
  prefers-reduced-motion, scroll-reveal with IntersectionObserver.
· Accessibility — semantic landmarks, one h1, ordered headings, labels on every input,
  visible :focus-visible rings, aria where needed, skip link, alt text.
· Performance — no layout thrash, passive listeners, lazy images with dimensions,
  will-change only where it matters, <script> deferred at the end.
· Responsive — mobile-first, real breakpoints (640/768/1024/1280), no horizontal
  overflow, touch targets ≥44px, clamp() typography.
· Polish — layered shadows, 1px borders with alpha, radii scale, subtle grain/gradient
  meshes, icon consistency, empty/loading/error states, micro-interactions on hover.
· Arabic — proper RTL, no mirrored-by-mistake icons, Arabic-friendly fonts
  (Cairo/Tajawal/IBM Plex Sans Arabic), digits and punctuation handled correctly.`;

/**
 * The full system prompt for one improvement run.
 *
 * @param ruleIds findings detected in the user's file → the law is focused on them,
 *                which is what makes the fix surgical instead of generic.
 */
export function designSystem(opts: {
  depth: DesignDepth;
  lang: string;
  ruleIds?: string[];
  keep?: string;
}): string {
  const depth = DEPTH_META[opts.depth];
  const law = opts.ruleIds?.length ? lawForFindings(opts.ruleIds) : DESIGN_LAW(34);
  const rtl = opts.lang === "ar";

  return `${DESIGN_IDENTITY}

${QUALITY_BAR}

DEPTH FOR THIS RUN — ${depth.ar.toUpperCase()}: ${depth.sub}
${opts.depth === "light" ? "Keep the DOM structure and every selector; rewrite the stylesheet, the a11y attributes and the micro-interactions." : ""}
${opts.depth === "deep" ? "You may restructure markup (grid, sections, components) as long as ids/classes used by the scripts survive and every feature still works." : ""}
${opts.depth === "rebuild" ? "Re-implement the same product from scratch at a 2026 level: design tokens, component layer, motion system, states, and at least " + depth.minLines + " lines of real code. Same content, same behaviour, radically better craft." : ""}

FOCUSED DESIGN LAW (fix every numbered item you can — these were detected in THIS file):
${law}

LANGUAGE: ${rtl ? "Arabic — write all UI copy in Arabic, keep the document dir=\"rtl\"" : opts.lang}.
${opts.keep ? `THE USER ALSO ASKED TO KEEP: ${opts.keep}` : ""}

${OUTPUT_CONTRACT}`;
}

/** Short Arabic label for the streaming stage rail. */
export function depthStageLabel(depth: DesignDepth): string {
  return DEPTH_AR[depth] ?? "تحسين";
}
