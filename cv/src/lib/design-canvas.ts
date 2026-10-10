/**
 * Nexus AI v11 — DESIGN CANVAS.
 *
 * "صمّم في الشاشة متل جيميني": when the user asks for a visual thing (poster, logo, UI screen,
 * dashboard, CV, menu, infographic, chart, landing page…), the answer is not a wall of text —
 * it is a LIVE artifact rendered beside the chat, instantly, from a single self-contained HTML
 * document that is responsive, RTL-aware and exportable as PNG / HTML.
 */

export type CanvasKind =
  | "poster"
  | "logo"
  | "ui"
  | "dashboard"
  | "chart"
  | "document"
  | "slides"
  | "diagram"
  | "none";

/**
 * NOTE: JavaScript's `\b` is ASCII-only — `\bملصق\b` never matches, because Arabic letters are
 * not "word characters". Every pattern below therefore uses explicit boundaries that work for
 * Arabic, Latin and French at the same time.
 */
/** Letters only — Arabic punctuation (، ؛ ؟ ٪) must NOT count as part of a word. */
const L = "A-Za-z0-9\\u0620-\\u065F\\u0660-\\u0669\\u066E-\\u06D3\\u06D5\\u06E5-\\u06EF\\u06FA-\\u06FF\\u0750-\\u077F";
/** matches `src` only when it is not glued to another letter */
const w = (src: string) => new RegExp(`(?<![${L}])(?:${src})(?![${L}])`, "iu");

const PATTERNS: Array<[CanvasKind, RegExp]> = [
  ["poster", w("poster|flyer|affiche|بوستر|ملصق|أفيش|إعلان|منشور|كارت|بطاقة|دعوة|بانر|banner")],
  ["logo", w("logo|لوغو|شعار|هوية بصرية|brand|branding")],
  [
    "ui",
    w("ui|ux|واجهة|تصميم تطبيق|تصميم موقع|صفحة هبوط|landing\\s*page|mockup|wireframe|prototype|شاشة|سكرين|app screen|design system"),
  ],
  ["dashboard", w("dashboard|لوحة تحكم|لوحة التحكم|لوحة تحليلات|admin panel|تحليلات|analytics")],
  ["chart", w("chart|graph|رسم بياني|مخطط بياني|إحصائي|احصائي|infographic|إنفوغراف|انفوغراف")],
  [
    "document",
    w("cv|resume|سيرة ذاتية|السيرة الذاتية|فاتورة|invoice|عقد|contract|تقرير|report|menu|قائمة طعام|شهادة|certificate"),
  ],
  ["slides", w("slide|slides|presentation|عرض تقديمي|بريزنتاسيون|سلايد|powerpoint")],
  ["diagram", w("diagram|مخطط انسيابي|flow\\s*chart|organigram|هيكل تنظيمي|شجرة|mind\\s*map|خريطة ذهنية")],
];

const VERB = w("صمم|صمّم|اصنع|ابن|ابني|ابنِ|اعمل|دير|سوي|سوّي|اكتبلي|طلع|حضرلي|design|create|make|build|generate|montre|montrez|je veux|i want|أريد|بغيت|حاب|نحتاج");

/** Does this message want something DRAWN on screen rather than described? */
export function detectCanvas(text: string): CanvasKind {
  const t = text.slice(0, 1200);
  for (const [kind, re] of PATTERNS) {
    if (re.test(t)) return kind;
  }
  return "none";
}

/**
 * v15 — PROMPT REQUESTS ARE NOT CANVAS REQUESTS.
 *
 * Bug the user hit: "اعطيني برومت لتصميم شعار" matched the `logo` pattern, so
 * the canvas contract fired, the model emitted a full HTML artifact, and the
 * code-builder panel opened. The user wanted a paragraph of English text to
 * paste into an image generator — not an app.
 *
 * Asking FOR a prompt is a writing task. It must come back as prose.
 */
const PROMPT_WORDS = w("prompt|prompts|برومبت|برومت|بروموت|برومبتات|مطالبة|نص الطلب|وصف للصورة|وصف الصورة");
const PROMPT_ASK = w(
  "اعطيني|أعطني|عطيني|اكتبلي|اكتب لي|كتبلي|جهزلي|حضرلي|صيغ لي|صغلي|ابغى|بغيت|حاب|نحتاج|give me|write me|generate a|make me a|i need a|craft"
);

/** True when the user wants the TEXT of a prompt, not a built artifact. */
export function wantsPromptText(text: string): boolean {
  const t = text.slice(0, 600);
  if (!PROMPT_WORDS.test(t)) return false;
  // "برومت" alone, or with any asking verb, is a writing request.
  // Only an explicit "build an app that generates prompts" stays a build.
  const buildsAnApp = w("تطبيق|موقع|صفحة|app|website|page|dashboard|لوحة").test(t);
  return !buildsAnApp || PROMPT_ASK.test(t);
}

export function wantsCanvas(text: string): boolean {
  if (wantsPromptText(text)) return false; // v15: never open the canvas for a prompt
  const kind = detectCanvas(text);
  return kind !== "none" && VERB.test(text.slice(0, 400));
}

/** Directive that forces a prompt answer to be readable prose, never a code block. */
export const PROMPT_TEXT_CONTRACT = `

===== PROMPT REQUEST — OUTPUT FORMAT =====
The user is asking you to WRITE A PROMPT (text they will paste into another AI).

- Output it as plain readable prose. Do NOT wrap it in a code fence.
- Do NOT use \`\`\` around it. Do NOT call it JSON, HTML or a file.
- No file manifest, no project structure, no build contract.
- Give the prompt itself first, then at most 3 short bullets on how to tweak it.
- If several variants help, separate them with a short bold heading each.
- Keep the prompt in English when it is meant for an image/video model, and say
  so in one line, but keep your surrounding explanation in the user's language.
===== END FORMAT =====
`;


const KIND_BRIEF: Record<Exclude<CanvasKind, "none">, string> = {
  poster:
    "A print-grade poster: one dominant focal element, a clear visual hierarchy (eyebrow → headline → support → CTA → footer), a confident colour story, generous margins, and typography that reads from 3 metres away. Default canvas 1080x1350 inside a responsive wrapper.",
  logo:
    "A logo lockup built from pure SVG (no raster, no external font): the mark, the wordmark, a one-line tagline, plus a presentation board showing the mark on light, on dark, in monochrome, and at 32px. Geometry must stay crisp at any size.",
  ui:
    "A real product screen, not a wireframe: navigation, hero or header, the main working area with realistic content, side panel, states (hover, active, empty, loading), and a footer. Mobile-first, fluid down to 360px, with a visible, consistent design-token system.",
  dashboard:
    "An analytics dashboard: KPI cards with trend deltas, at least three SVG charts drawn from inline data (line, bar, donut), a sortable table, filters, a date-range control, and a side navigation. Everything populated with believable data.",
  chart:
    "Charts drawn as hand-written inline SVG (no library, no network): correct axes, gridlines, labels, legend, tooltips on hover, animated draw-in, and an accessible table fallback underneath.",
  document:
    "A print-ready A4 document with a proper type scale, a header band, structured sections, tables where useful, page padding that survives printing (@media print), and no external assets.",
  slides:
    "A deck of 6-12 slides inside one file: keyboard arrows + swipe + dot navigation, a title slide, section slides, content slides with real text, a closing slide, slide counter, and smooth transitions.",
  diagram:
    "A diagram drawn in inline SVG with real geometry: nodes, labels, arrows with markers, grouping, legend, and a layout that stays readable on a phone.",
};

/**
 * The contract that turns any visual request into a live on-screen artifact.
 * Appended to the system prompt whenever `wantsCanvas()` is true.
 */
export function canvasContract(kind: CanvasKind): string {
  if (kind === "none") return "";
  return `

DESIGN CANVAS CONTRACT (v11) — the user sees your answer RENDERED LIVE, not as text.
BRIEF: ${KIND_BRIEF[kind]}

OUTPUT FORMAT (strict)
- Reply with ONE \`\`\`html block containing a complete self-contained document: <!DOCTYPE html> … </html>.
- No words before the block. After the block, at most TWO short lines in the user's language describing what you can change next.
- Zero network requests: no CDN, no Google Fonts, no external images. Draw illustrations, icons and charts with inline SVG, CSS gradients or canvas. System font stacks only.

DESIGN LAW
- Design tokens in :root (colour, space, radius, shadow, type scale) and use them everywhere — never hard-code a second palette.
- One confident palette: background, 2-3 layered surfaces, 1 accent, 1 support accent, semantic success/warn/danger, plus text and muted text. Contrast >= 4.5:1 on every text.
- Depth through layered surfaces, soft shadows and hairlines — never a flat black page with grey boxes.
- 8px spacing grid, 14-24px radii, 150-250ms micro-interactions, visible focus rings, 44px minimum tap targets.
- Responsive: perfect at 360px, 768px and 1440px. Nothing clipped, nothing overflowing horizontally.

ARABIC / RTL
- If the content is Arabic: <html lang="ar" dir="rtl">, logical CSS properties (margin-inline, padding-inline, inset-inline), line-height >= 1.8, letter-spacing: normal (never spaced Arabic), and numerals in the style the user used.
- Mixed Arabic + Latin: wrap Latin runs in <span dir="ltr"> so punctuation does not jump.

LIVE BEHAVIOUR
- The artifact must do something: hover states, a theme toggle when it makes sense, animated entrance, and a small toolbar with "تحميل PNG" (html-to-canvas via an inline SVG foreignObject or canvas drawing) and "تحميل HTML" (Blob download) implemented inline.
- Everything runs on first paint with no console error, no undefined variable, every id and selector consistent.`;
}

/** Short hint shown in the UI so the user knows a live preview is coming. */
export const CANVAS_LABELS: Record<Exclude<CanvasKind, "none">, string> = {
  poster: "ملصق مباشر",
  logo: "شعار مباشر",
  ui: "واجهة مباشرة",
  dashboard: "لوحة تحكم مباشرة",
  chart: "رسم بياني مباشر",
  document: "مستند مباشر",
  slides: "عرض تقديمي مباشر",
  diagram: "مخطط مباشر",
};
