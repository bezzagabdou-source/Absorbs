/**
 * ⚡ Prompt Booster (v18.2) — turns a rough request into a complete build brief.
 *
 * Pure string logic: no network, no model call, no cost. The user sees the expanded brief in the
 * input box and can edit it before sending. Works in Arabic, Darija, French and English.
 *
 * Kinds: "game" (single-file HTML game), "site" (landing page / website / dashboard),
 * "code" (script, function, bot, API) and "other" (left alone).
 */

export type BoostKind = "game" | "site" | "code" | "other";

export interface BoostResult {
  kind: BoostKind;
  /** the expanded brief (or the original text when nothing was boosted) */
  text: string;
  /** false when the text was already detailed or is not a build request */
  changed: boolean;
}

const GAME = /(لعب[ةه]|العاب|ألعاب|\bgame|\bjeu\b|jeux?\b|arcade|platformer|shooter|puzzle|snake|tetris|flappy)/i;
const SITE = /(موقع|مواقع|\bsite\b|website|landing|صفح[ةه]|portfolio|بورتفوليو|متجر|\bstore\b|dashboard|لوح[ةه] (تحكم|قيادة)|page\b)/i;
const CODE = /(كود|\bcode\b|script|سكريبت|سكربت|برنامج|\bprogram\b|function|دالة|api\b|\bbot\b|بوت|extension|إضاف[ةه]|scraper|سكرابر)/i;
const BUILD_VERB =
  /(اصنع|صنع|اعمل|سو[يّ]|صمم|برمج|ابن[يِ]|انشئ|أنشئ|طور|create|build|make|develop|design|generate|écris|cr[ée]e|fais|dev|ديرلي|دير|درلي|بغيت|ابغى|أبغى|نحب|حاب|أريد|اريد|write|اكتب)/i;
const ARABIC = /[\u0600-\u06FF]/;
const FRENCH = /\b(le|la|les|une|des|pour|avec|je|veux|faire|site|jeu|cr[ée]e)\b/i;

/** Detects what the user wants built. Game beats site beats code (a "game website" is still a game). */
export function detectBoostKind(text: string): BoostKind {
  const t = (text || "").trim();
  if (t.length < 4) return "other";
  if (!BUILD_VERB.test(t) && !GAME.test(t) && !SITE.test(t) && !CODE.test(t)) return "other";
  if (GAME.test(t)) return "game";
  if (SITE.test(t)) return "site";
  if (CODE.test(t)) return "code";
  return "other";
}

const LANG_LINE = (raw: string): string => {
  if (ARABIC.test(raw)) {
    return "Reply in the same Arabic / Algerian Darija the user wrote in. Keep technical names in English.";
  }
  if (FRENCH.test(raw)) return "Reply in French. Keep technical names in English.";
  return "Reply in the same language the user wrote in.";
};

const GAME_SPEC = [
  "Deliver ONE self-contained HTML file: inline CSS and JS, canvas rendering, no external assets that can fail.",
  "Game states: MENU → PLAYING → PAUSED → GAME OVER, with restart and a clear HUD (score, lives or time, level).",
  "Controls: keyboard AND touch (on-screen buttons or swipe). Pause on window blur.",
  "Difficulty ramps up over time; include at least 3 levels or waves with a visible progression.",
  "Feedback: particles or screen shake on hits, a short synth sound via Web Audio (muted toggle), smooth 60 FPS with delta-time movement.",
  "Persist the best score in localStorage. Responsive canvas that fits phones and desktops.",
];

const SITE_SPEC = [
  "Deliver a complete, responsive page or site: semantic HTML5, one stylesheet block, minimal JS.",
  "Sections: hero with a clear call to action, benefits or features, social proof or details, FAQ or pricing if it fits, footer.",
  "Visual design: a deliberate palette with contrast ≥ 4.5:1, a clear type scale, consistent spacing, subtle motion that respects prefers-reduced-motion.",
  "Accessibility: labelled form fields, keyboard focus styles, alt text, sensible heading order.",
  "SEO basics: title, meta description, Open Graph tags. No lorem ipsum: write real, specific copy for the topic.",
  "If the language is Arabic, set dir=\"rtl\" and use a readable Arabic-friendly font stack.",
];

const CODE_SPEC = [
  "Deliver complete, runnable code in the fewest files possible. No placeholders, no TODOs, no omitted parts.",
  "Validate inputs, handle errors explicitly, and cover the edge cases you can think of.",
  "Show how to run it (exact commands) and one short usage example.",
  "Keep dependencies minimal and state each one. Prefer the standard library when it is enough.",
  "Before answering, re-read the code once for bugs, off-by-one errors and wrong imports, then fix them.",
];

const QUALITY = [
  "Quality bar: production-ready, no console errors, no broken links, nothing left as a stub.",
  "If a detail is missing, choose the most sensible default and state the assumption in one line.",
];

const SPECS: Record<Exclude<BoostKind, "other">, { title: string; spec: string[] }> = {
  game: { title: "Game build", spec: GAME_SPEC },
  site: { title: "Website build", spec: SITE_SPEC },
  code: { title: "Code build", spec: CODE_SPEC },
};

/** Expands a rough build request. Returns the original text when there is nothing to add. */
export function boostPrompt(raw: string): BoostResult {
  const text = (raw || "").trim();
  const kind = detectBoostKind(text);
  // already a detailed brief (long, or it already contains a spec list): leave it alone
  if (kind === "other" || text.length > 600 || /\n\s*[-•*]\s/.test(text)) {
    return { kind, text, changed: false };
  }
  const { title, spec } = SPECS[kind];
  const brief = [
    `# ${title}`,
    "",
    "## Request",
    text,
    "",
    "## Specification",
    ...spec.map((s) => `- ${s}`),
    "",
    "## Quality",
    ...QUALITY.map((s) => `- ${s}`),
    "",
    "## Language",
    `- ${LANG_LINE(text)}`,
  ].join("\n");
  return { kind, text: brief, changed: true };
}
