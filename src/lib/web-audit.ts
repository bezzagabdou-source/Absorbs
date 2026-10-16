/**
 * NEXUS v19 — محلّل المواقع (static website audit)
 * ---------------------------------------------------------------------------
 * Reads a finished HTML/CSS/JS document and reports what a senior designer would
 * report: broken RTL, dead buttons, missing focus styles, float money maths,
 * invented image URLs, cramped spacing, no empty states… Every finding is tied
 * to a rule in the design knowledge base, so the improvement engine gets an
 * exact fix list instead of "make it prettier".
 *
 * Pure text analysis — no browser, no execution, isomorphic.
 */
import { CATS, CAT_AR, RULE_BY_DETECT, RULE_BY_ID, SEV_WEIGHT, type DesignCat, type DesignRule, type Severity } from "@/lib/design-kb";

export type Finding = {
  ruleId: string;
  detect: string;
  cat: DesignCat;
  sev: Severity;
  ar: string;
  /** short English form — goes straight into the improvement prompt */
  en: string;
  fix: string;
  /** what the analyzer saw (numbers, snippets) */
  evidence: string;
  count: number;
  weight: number;
};

export type CatScore = { cat: DesignCat; ar: string; score: number; findings: number; worst: Severity | null };

export type AuditReport = {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  findings: Finding[];
  byCat: CatScore[];
  stats: {
    bytes: number;
    lines: number;
    htmlChars: number;
    cssChars: number;
    jsChars: number;
    nodes: number;
    images: number;
    buttons: number;
    inputs: number;
    sections: number;
    scripts: number;
    styles: number;
    arabic: boolean;
    rtl: boolean;
    tokens: number;
    mediaQueries: number;
  };
  /** every rule id that fired, ordered by severity — feeds the improvement prompt */
  ruleIds: string[];
};

const AR_RE = /[\u0600-\u06FF]/;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/* ------------------------------------------------------------------ *
 * extraction helpers
 * ------------------------------------------------------------------ */
function blocks(src: string) {
  const styles: string[] = [];
  const scripts: string[] = [];
  for (const m of src.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) styles.push(m[1]);
  for (const m of src.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/i.test(m[1])) scripts.push(m[2]);
  }
  const markup = src
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  return { css: styles.join("\n"), js: scripts.join("\n"), markup };
}

/** Strips comments and string contents so counters are not fooled. */
function stripNoise(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    .replace(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g, '""');
}

const count = (src: string, re: RegExp) => (src.match(re) ?? []).length;
const has = (src: string, re: RegExp) => re.test(src);

/* ------------------------------------------------------------------ *
 * colour maths (real WCAG contrast on the declared tokens)
 * ------------------------------------------------------------------ */
type RGB = [number, number, number];
function toRgb(v: string): RGB | null {
  const s = v.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const [r, g, b] = m[1].split("");
    return [parseInt(r + r, 16), parseInt(g + g, 16), parseInt(b + b, 16)];
  }
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const named: Record<string, RGB> = { white: [255, 255, 255], black: [0, 0, 0] };
  return named[s.toLowerCase()] ?? null;
}
function lum([r, g, b]: RGB): number {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number | null {
  const A = toRgb(a);
  const B = toRgb(b);
  if (!A || !B) return null;
  const l1 = lum(A);
  const l2 = lum(B);
  return Number((((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2));
}
function hueSpread(hexes: string[]): number {
  const hues = new Set<number>();
  for (const h of hexes) {
    const rgb = toRgb(h);
    if (!rgb) continue;
    const [r, g, b] = rgb.map((x) => x / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (max === 0) continue;
    if (d / max < 0.28) continue; // grey-ish: not a hue
    let hue = 0;
    if (d) {
      if (max === r) hue = ((g - b) / d) % 6;
      else if (max === g) hue = (b - r) / d + 2;
      else hue = (r - g) / d + 4;
    }
    hues.add(Math.round((hue * 60 + 360) % 360 / 24) * 24);
  }
  return hues.size;
}

/* ------------------------------------------------------------------ *
 * the audit
 * ------------------------------------------------------------------ */
/** score = 100·e^(−penalty/K). K=46 globally; a single category decays faster. */
const SCORE_K = 46;
const CAT_K = 13;

export function auditHtml(src: string, opts: { lang?: string } = {}): AuditReport {
  const { css, js, markup } = blocks(src);
  const jsClean = stripNoise(js);
  const cssClean = stripNoise(css);
  const arabic = AR_RE.test(markup) || opts.lang === "ar";
  const rtl = has(src, /<html[^>]+dir\s*=\s*["']?rtl/i) || has(markup, /dir\s*=\s*["']rtl["']/i);

  const stats = {
    bytes: src.length,
    lines: src.split("\n").length,
    htmlChars: markup.length,
    cssChars: css.length,
    jsChars: js.length,
    nodes: count(markup, /<[a-z][\w-]*[\s>]/gi),
    images: count(markup, /<img\b/gi),
    buttons: count(markup, /<button\b/gi),
    inputs: count(markup, /<(input|select|textarea)\b/gi),
    sections: count(markup, /<section\b/gi),
    scripts: count(src, /<script\b/gi),
    styles: count(src, /<style\b/gi),
    arabic,
    rtl,
    tokens: count(css, /--[\w-]+\s*:/g),
    mediaQueries: count(css, /@media\b/g),
  };

  /* CSS declared inline (style="…") counts too — a lot of generated pages put
     their spacing there, and ignoring it produced false "no rhythm" findings. */
  const inlineCss = [...markup.matchAll(/style\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join("\n");
  const styleAll = `${css}\n${inlineCss}`;

  /* What kind of document is this? Product-completeness rules (empty/loading/
     error states, persistence, prices, social proof…) only make sense for the
     document shapes that can actually have them. Firing them on a static
     brochure page is a false positive, so they are gated on these hints. */
  const appish = stats.inputs > 2 || stats.buttons > 4 || has(js, /addEventListener|localStorage|fetch\s*\(|=>/) || stats.nodes > 220;
  const listish = count(markup, /<(li|tr|article)\b/gi) > 6 || has(js, /\.(map|forEach|filter)\s*\(|render|innerHTML/i);
  const dynamic = has(js, /fetch\s*\(|localStorage|indexedDB|XMLHttpRequest|async\s/i);
  const commercial = has(markup, /(منتج|منتجات|product|price|سعر|أسعار|دج|DZD|shop|متجر|buy|شراء|cart|سلة|service|خدمة|pricing|عرض)/i);
  const hasForm = /<form\b/i.test(markup);

  const hits: { detect: string; evidence: string; count: number }[] = [];
  const add = (detect: string, evidence: string, n = 1) => hits.push({ detect, evidence, count: n });
  const when = (cond: boolean, detect: string, evidence: string, n = 1) => {
    if (cond) add(detect, evidence, n);
  };

  /* Inline handlers are real JavaScript and inline style attributes are real
     CSS. Pages produced by weaker models put everything there, so every
     detector below reads the union instead of only the <style>/<script> blocks. */
  const handlers = [...markup.matchAll(/\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)]
    .map((m) => m[1] ?? m[2] ?? "")
    .join("\n");
  const cssAll = styleAll;
  const jsAll = `${js}\n${handlers}`;

  /* ---------- layout ---------- */
  when(!has(src, /name\s*=\s*["']?viewport/i), "no-viewport", "لا يوجد <meta viewport>");
  when(has(cssAll, /100vh/) && !has(cssAll, /100dvh/), "uses-100vh", `${count(cssAll, /100vh/g)}× 100vh`);
  // `max-width:1200px` is the *fix*, not the bug — only a bare `width:` counts.
  const wideWidths = [...cssAll.matchAll(/([-a-z]*)width\s*:\s*(\d+)px/gi)].filter((m) => m[1].toLowerCase() === "" && Number(m[2]) >= 700);
  const hugeMin = [...cssAll.matchAll(/min-width\s*:\s*(\d+)px/gi)].filter((m) => Number(m[1]) >= 900).length;
  when(
    wideWidths.length > 0 && !has(cssAll, /overflow-x\s*:\s*(hidden|clip)/) && stats.mediaQueries === 0,
    "overflow-x",
    `${wideWidths.length} عرض ثابت ≥700px بلا أي @media`,
    wideWidths.length + hugeMin
  );
  when(!has(cssAll, /max-width\s*:/), "no-max-width", "لا يوجد max-width في كل CSS");
  when(count(cssAll, /float\s*:\s*(left|right)/g) > 2, "legacy-layout", `${count(cssAll, /float\s*:\s*(left|right)/g)}× float`);
  when(has(cssAll, /position\s*:\s*fixed/) && !has(cssAll, /env\(\s*safe-area/), "no-safe-area", "position:fixed بلا safe-area");
  when(stats.lines > 220 && !has(cssAll, /position\s*:\s*sticky/) && /<(header|nav)\b/i.test(markup), "no-sticky", "شريط تنقل بلا position:sticky");
  const zValues = new Set([...cssAll.matchAll(/z-index\s*:\s*(\d+)/g)].map((m) => Number(m[1])));
  when(zValues.size > 7 || [...zValues].some((z) => z > 9000), "z-chaos", `${zValues.size} قيمة z-index`);

  /* ---------- colour ---------- */
  const hexes = [...cssAll.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)].map((m) => m[0]);
  const uniqHex = Array.from(new Set(hexes.map((h) => h.toLowerCase())));
  when(stats.tokens < 4 && uniqHex.length > 6, "no-color-tokens", `${uniqHex.length} لون · ${stats.tokens} رمز`);
  when(!has(cssAll, /box-shadow\s*:/) && stats.nodes > 60, "flat-surface", "بلا أي box-shadow");
  when(hueSpread(uniqHex) > 7, "too-many-hues", `${hueSpread(uniqHex)} درجة لونية مشبعة`);
  when(!has(cssAll, /--accent|--brand|--primary/i) && uniqHex.length > 8, "no-accent", "لا يوجد رمز لون التمييز");
  when(uniqHex.length > 26 && stats.tokens < 6, "hard-colors", `${uniqHex.length} لون ثابت`);

  // real contrast on the declared background/text pair
  const bgTok = pickColor(cssAll, ["--bg", "--background", "--surface", "--nx-bg"]) ?? pickColor(cssAll, [], /body\s*\{[^}]*background(?:-color)?\s*:\s*([^;}]+)/);
  const fgTok = pickColor(cssAll, ["--text", "--fg", "--color-text", "--nx-text"]) ?? pickColor(cssAll, [], /body\s*\{[^}]*\bcolor\s*:\s*([^;}]+)/);
  /* Pages that declare no tokens still have colours — inline `style="color:#ccc"`
     and the legacy `bgcolor` attribute. Compare every text colour we can find
     against the effective page background instead of giving up. */
  const legacyBg = /<body[^>]+bgcolor\s*=\s*["']?\s*(#[0-9a-f]{3,8}|white|black)/i.exec(src)?.[1];
  const pageBg = bgTok ?? legacyBg ?? "#ffffff";
  const textColors = Array.from(
    new Set(
      [...cssAll.matchAll(/([-a-z]*)color\s*:\s*(#[0-9a-f]{3,8}|rgba?\([^)]+\)|white|black)/gi)]
        .filter((m) => !/^(background|border|outline|text-decoration|column|caret|accent|scrollbar|fill|flood|lighting|-webkit-text-fill)/i.test(m[1]))
        .map((m) => m[2].toLowerCase())
    )
  );
  const worstPair = textColors
    .map((c) => ({ c, r: contrast(c, pageBg) }))
    .filter((x): x is { c: string; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r)[0];
  /* token pages: only the *page-level* text tokens are compared (a dark colour
     on a gold button is correct, so element colours are not judged here) */
  const tokenPair = [...cssAll.matchAll(/(--[\w-]*(?:text|fg|muted|dim|copy|body|ink)[\w-]*)\s*:\s*(#[0-9a-f]{3,8})/gi)]
    .map((m) => ({ name: m[1], c: m[2], r: contrast(m[2], pageBg) }))
    .filter((x): x is { name: string; c: string; r: number } => x.r !== null)
    .sort((a, b) => a.r - b.r)[0];
  if (bgTok && fgTok) {
    const ratio = contrast(bgTok, fgTok);
    if (ratio !== null && ratio < 4.5) add("low-contrast", `${fgTok} على ${bgTok} = ${ratio}:1`);
    else if (tokenPair && tokenPair.r < 4.5) add("low-contrast", `${tokenPair.name}: ${tokenPair.c} على ${pageBg} = ${tokenPair.r}:1`);
  } else if (worstPair && worstPair.r < 4.5) {
    add("low-contrast", `${worstPair.c} على ${pageBg} = ${worstPair.r}:1`);
  } else if (uniqHex.length > 4) {
    // no tokens: compare the darkest and lightest colours as a rough proxy
    const sorted = uniqHex.map((h) => ({ h, l: luminanceOf(h) })).sort((a, b) => a.l - b.l);
    const ratio = contrast(sorted[0].h, sorted[sorted.length - 1].h);
    if (ratio !== null && ratio < 4.5) add("low-contrast", `أقرب زوجين في اللوحة: ${ratio}:1`);
  }

  /* ---------- typography ---------- */
  const sizes = new Set([...cssAll.matchAll(/font-size\s*:\s*([\d.]+(?:px|rem|em|clamp))/g)].map((m) => m[1]));
  when(sizes.size < 4 && stats.nodes > 60, "no-type-scale", `${sizes.size} أحجام خط فقط`);
  if (arabic) {
    // headings legitimately run 1.1–1.3 — only body-ish rules are measured
    const bodyCss = cssAll.replace(/(?:^|})\s*([^{}]*\b(?:h[1-6]|\.title|\.display|heading|logo|hero-h)\b[^{}]*)\{[^}]*\}/gi, "}");
    const lh = [...bodyCss.matchAll(/line-height\s*:\s*([\d.]+)/g)].map((m) => Number(m[1])).filter((n) => n > 0 && n < 12);
    when(lh.length > 0 && Math.min(...lh) < 1.5, "tight-leading", `أضيق line-height للنص = ${Math.min(...lh)}`);
    when(!has(cssAll, /Noto (Sans|Kufi) Arabic|Cairo|Tajawal|IBM Plex Sans Arabic|Amiri|Segoe UI|system-ui/i), "no-ar-font", "لا يوجد خط عربي صريح");
  }
  when(!has(cssAll, /(\d+)ch\b|65ch|70ch|75ch/), "long-lines", "لا يوجد قياس سطر (ch)");
  when(has(jsAll, /\d{2}:\d{2}|timer|counter|price|total|count/i) && !has(cssAll, /tabular-nums/) && !has(cssAll, /font-variant-numeric/), "no-tabular-nums", "أرقام متغيّرة بلا tabular-nums");
  when(!has(cssAll, /font-smoothing/), "no-smoothing", "بلا font-smoothing");

  /* ---------- spacing ---------- */
  const oddPx = count(cssAll, /(?:padding|margin|gap)\s*:\s*[^;]*\b(?:7|9|11|13|15|17|19|21|23|25|27|29|31)px/g);
  when(oddPx > 3, "no-space-scale", `${oddPx} قيمة خارج شبكة 8px`, oddPx);
  const radii = new Set([...cssAll.matchAll(/border-radius\s*:\s*([\d.]+px|[\d.]+rem)/g)].map((m) => m[1]));
  when(radii.size > 7, "mixed-radius", `${radii.size} زوايا مختلفة`);
  when(count(cssAll, /padding\s*:\s*(?:[0-9]|1[0-6])px/g) > 6 && stats.sections > 2, "cramped", "حشوات صغيرة في كل مكان");
  when(stats.sections > 1 && !has(styleAll, /padding(?:-block)?\s*:\s*(?:4[0-9]|[5-9]\d|\d{3})px/) && !has(styleAll, /padding(?:-block)?\s*:\s*(?:[3-9](?:\.\d+)?rem)/), "unbalanced", "أقسام بلا مسافات كبيرة بينها");

  /* ---------- motion ---------- */
  const animated = has(cssAll, /animation\s*:|transition\s*:/);
  when(animated && !has(cssAll, /prefers-reduced-motion/), "no-reduced-motion", "حركات بلا prefers-reduced-motion");
  const trans = [...cssAll.matchAll(/transition[^;{}]*?(\d*\.?\d+)s/g)].map((m) => Number(m[1])).filter((n) => n > 0);
  const anims = [...cssAll.matchAll(/animation[^;{}]*?(\d*\.?\d+)s([^;{}]*)/g)].filter((m) => !/infinite/i.test(m[2])).map((m) => Number(m[1]));
  const slowest = Math.max(...trans, ...anims, 0);
  when(slowest > 0.65, "slow-motion", `أطول مدة تفاعل ${slowest}s`);
  when(trans.length > 2 && !has(cssAll, /cubic-bezier|ease-(in-out|out)|var\(--nx-ease|var\(--v12-ease/), "linear-motion", `${trans.length} انتقال بلا منحنى تسارع`);
  when(stats.buttons > 2 && !has(cssAll, /:hover/), "no-hover", `${stats.buttons} زر بلا :hover`);
  when(!has(jsAll, /IntersectionObserver/) && stats.sections > 3, "no-reveal", "أقسام بلا كشف عند السكرول");
  when(stats.images > 0 && !has(cssAll, /aspect-ratio/) && !has(markup, /<img[^>]+width=/i), "layout-shift", "صور بلا أبعاد ولا aspect-ratio");
  when(has(cssAll, /transition\s*:[^;]*\b(top|left|right|bottom|width|height)\b/), "reflow-anim", "حركة على خصائص تسبب إعادة تخطيط");

  /* ---------- accessibility ---------- */
  const imgsNoAlt = count(markup, /<img\b(?![^>]*\balt\s*=)[^>]*>/gi);
  when(imgsNoAlt > 0, "img-no-alt", `${imgsNoAlt} صورة بلا alt`, imgsNoAlt);
  when(has(cssAll, /outline\s*:\s*(none|0)/) && !has(cssAll, /:focus-visible|:focus\b/), "no-focus", "outline:none بلا بديل");
  when(!has(cssAll, /:focus-visible/) && stats.buttons > 0, "no-focus", "لا يوجد :focus-visible");
  const smallTargets = count(cssAll, /(?:width|height|size)\s*:\s*(?:2[0-9]|3[0-9])px/g) + count(markup, /\b(?:size|h|w)-(?:6|7|8)\b/g);
  when(stats.buttons > 3 && !has(cssAll, /(?:min-height|height)\s*:\s*4[4-9]px|min-h-\[?44/) && smallTargets > 2, "small-targets", `${smallTargets} هدف صغير`);
  when(!has(markup, /<(main|header|nav|section|footer|article)\b/i), "no-semantics", "كل الوسوم div");
  const heads = [...markup.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
  when(heads.length > 0 && (!heads.includes(1) || heads.some((h, i) => i > 0 && h - heads[i - 1] > 1)), "heading-order", `ترتيب: ${heads.slice(0, 8).join("→")}`);
  when(!has(src, /<html[^>]+\blang\s*=/i), "no-lang", "<html> بلا lang");
  when(has(jsAll, /toast|timer|countdown|total|status/i) && !has(markup, /aria-live|role\s*=\s*["']status/), "no-live", "تحديثات حية بلا aria-live");
  const iconBtns = count(markup, /<button\b[^>]*>\s*<(svg|img|span class="[^"]*icon)/gi);
  when(iconBtns > 0 && !has(markup, /aria-label/), "no-aria", `${iconBtns} زر أيقونة بلا aria-label`, iconBtns);

  /* ---------- ux states ---------- */
  when(listish && !has(src, /(ما كاين|لا توجد|لا يوجد|فارغ|no (data|items|results)|nothing (here|yet)|empty)/i), "no-empty-state", "قائمة/جدول بلا حالة «فارغ»");
  when(dynamic && !has(src, /(skeleton|loading|تحميل|جار|شحن|spinner)/i), "no-loading-state", "جلب بيانات بلا حالة تحميل");
  when(dynamic && !has(src, /(حدث خطأ|وقع خطأ|تعذّر|failed|error occurred|try again|عاود)/i), "no-error-state", "جلب بيانات بلا حالة خطأ");
  when(!has(src, /(toast|notification|تنبيه|إشعار|snackbar)/i) && stats.buttons > 4, "no-toast", "بلا إشعارات نجاح");
  const listeners = count(jsAll, /addEventListener\s*\(/g) + count(markup, /\son(?:click|change|input|submit|pointerdown|keydown)\s*=/gi);
  when(stats.buttons > 4 && listeners < Math.max(2, Math.round(stats.buttons * 0.35)), "dead-control", `${stats.buttons} زر · ${listeners} مستمع`, stats.buttons - listeners);
  when(has(jsAll, /delete|remove|حذف/i) && !has(jsAll, /confirm|modal|تأكيد/i), "no-confirm", "حذف بلا تأكيد");
  when(has(markup, /href\s*=\s*["']#/) && !has(cssAll, /scroll-behavior\s*:\s*smooth/), "no-smooth-scroll", "روابط داخلية بلا سكرول ناعم");
  when(has(jsAll, /location\.hash|router|view|screen/i) && !has(src, /(back|رجوع|عودة|‹|←)/i), "no-back", "شاشات فرعية بلا رجوع");

  /* ---------- copy ---------- */
  when(has(markup, /lorem ipsum|نص تجريبي|placeholder text|هنا يكتب|your text here|xxx/i), "lorem", "نص تجريبي في الصفحة");
  when(has(markup, /(حلول مبتكرة|موقع رائع|أفضل الخدمات|welcome to our (website|site)|best solutions|we are the best)/i), "vague-copy", "عناوين عامة بلا قيمة");
  when(has(markup, /(اضغط هنا|click here|read more|المزيد|التالي)\s*<\/(button|a)>/i), "weak-cta", "دعوة غامضة");
  const longPara = [...markup.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].filter((m) => m[1].replace(/<[^>]+>/g, "").length > 620).length;
  when(longPara > 0, "wall-of-text", `${longPara} فقرة أطول من 620 حرفًا`, longPara);

  /* ---------- conversion ---------- */
  const heroArea = markup.slice(0, 3000);
  when(!/<h1\b/i.test(heroArea) || !/<(button|a)\b/i.test(heroArea), "weak-hero", "الجزء الأول بلا عنوان أو بلا دعوة");
  when(count(heroArea, /<button\b[^>]*(primary|cta|solid)/gi) > 2, "many-cta", "أكثر من دعوة رئيسية في الواجهة");
  when(commercial && !has(markup, /(شهادة|شهادات|آراء|تقييم|عميل|عملاء|testimonial|review|rating|clients|ثقة)/i), "no-proof", "صفحة بيع بلا دليل اجتماعي");
  when(commercial && !has(markup, /(دج|DA|DZD|\$|€|price|سعر|prix|\/شهري|\/month)/i), "no-price", "صفحة بيع بلا أسعار أو عملة");
  when(commercial && !has(markup, /(ضمان|استرجاع|gratis|مجانا|free trial|بدون التزام|guarantee|cancel)/i), "no-guarantee", "بلا تقليل للمخاطرة");
  const formInputs = count(markup, /<(input|select|textarea)\b/gi);
  when(formInputs > 7, "long-form", `${formInputs} حقل في النموذج`);

  /* ---------- performance ---------- */
  const imgsNoSize = count(markup, /<img\b(?![^>]*\bwidth\s*=)[^>]*>/gi);
  when(imgsNoSize > 0 && !has(cssAll, /aspect-ratio/), "img-no-size", `${imgsNoSize} صورة بلا أبعاد`, imgsNoSize);
  const cdns = [...src.matchAll(/src\s*=\s*["'](https?:\/\/[^"']+)["']/gi)].map((m) => m[1]);
  when(cdns.some((u) => !/@\d|\d+\.\d+|\/\d+\./.test(u)) && cdns.length > 0, "unpinned-cdn", cdns.filter((u) => !/\d+\.\d+/.test(u)).slice(0, 2).join(" "));
  when(src.length > 420_000, "huge-file", `${Math.round(src.length / 1024)} KB في ملف واحد`);
  when(!has(src, /rel\s*=\s*["']preload|rel\s*=\s*["']preconnect/i) && (stats.images > 2 || cdns.length > 0), "no-preload", "بلا preload/preconnect");

  /* ---------- seo ---------- */
  when(!has(src, /<title\b[^>]*>[^<]{4,}/i) || !has(src, /name\s*=\s*["']description["']/i), "no-meta", "بلا عنوان أو وصف");
  when(stats.nodes > 25 && !has(src, /property\s*=\s*["']og:/i), "no-og", "بلا Open Graph");
  when(!has(markup, /<h1\b/i), "no-h1", "بلا H1");
  when(!has(src, /application\/ld\+json/), "no-jsonld", "بلا بيانات منظمة");

  /* ---------- arabic / rtl ---------- */
  if (arabic) {
    when(!rtl, "rtl-missing", "نص عربي بلا dir=rtl");
    when(rtl && count(cssAll, /\b(margin|padding|border)-(left|right)\b/g) > 6, "physical-props", `${count(cssAll, /\b(margin|padding|border)-(left|right)\b/g)} خاصية فيزيائية`, count(cssAll, /\b(margin|padding|border)-(left|right)\b/g));
    when(rtl && count(cssAll, /\b(left|right)\s*:/g) > 6, "physical-props", `${count(cssAll, /\b(left|right)\s*:/g)}× left/right`);
    when(dynamic && !has(jsAll, /toLocaleString|toLocaleDateString|toLocaleTimeString|Intl\.|ar-DZ|ar_DZ/) && has(markup, /(دج|\d{3,})/), "ar-nums", "أرقام تُحسب في الكود بلا تنسيق محلي");
    const textish = markup.replace(/<head[\s\S]*?<\/head>/gi, " ").replace(/<(link|script|style|meta)\b[^>]*>/gi, " ");
    when(rtl && has(textish, /(https?:\/\/|@[\w.]+\.\w|\.com\b)/) && !has(textish, /dir\s*=\s*["']ltr["']/), "ar-bidi", "روابط لاتينية بلا عزل LTR");

    /* letter-spacing tears Arabic script apart — the letters must stay joined */
    const tracking = [...cssAll.matchAll(/letter-spacing\s*:\s*(-?[\d.]+)(px|em|rem)/g)].map((m) => ({ v: Number(m[1]), u: m[2] }));
    const loose = tracking.filter((t) => (t.u === "px" ? t.v >= 0.6 : t.v >= 0.03)).length;
    when(loose > 0, "ar-type", `${loose} قاعدة letter-spacing تكسر اتصال الحروف العربية`, loose);

    /* formulaic machine-translated Arabic */
    const stiff = count(markup, /(انقر هنا|اضغط هنا|بواسطة ال|لا تتردد في|نحن فخورون ب|مرحبًا بك في موقعنا|نتشرف ب|في خدمتكم دائمًا)/gi);
    when(stiff > 0, "ar-stiff", `${stiff} عبارة عربية مترجمة/جامدة`, stiff);

    /* French/English chunks dropped inside Arabic sentences */
    const mixed = count(textish, /[\u0621-\u064A][\s،.!?]*\s+(?:[A-Za-z]{3,}\s+){2,}[\u0621-\u064A]/g);
    when(mixed > 1, "mixed-lang", `${mixed} مقطع لاتيني داخل جملة عربية`, mixed);
  }

  /* ---------- forms ---------- */
  const inputs = [...markup.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)];
  const labels = count(markup, /<label\b[^>]*for\s*=/gi);
  const ariaLabelled = inputs.filter((m) => /aria-label\s*=|aria-labelledby\s*=|\btitle\s*=/i.test(m[2])).length;
  const hidden = inputs.filter((m) => /type\s*=\s*["']?(hidden|submit|button|reset|checkbox|radio)/i.test(m[2])).length;
  const needLabel = Math.max(0, inputs.length - hidden);
  when(needLabel > 0 && labels + ariaLabelled < needLabel, "input-no-label", `${needLabel} حقل يحتاج تسمية · ${labels + ariaLabelled} موجود`, needLabel - labels - ariaLabelled);
  const placeholderOnly = inputs.filter((m) => /placeholder\s*=/i.test(m[2]) && !/aria-label\s*=|aria-labelledby\s*=|\btitle\s*=/i.test(m[2])).length;
  when(placeholderOnly > 0 && labels < needLabel, "placeholder-only", `${placeholderOnly} حقل يعتمد على placeholder وحده`, placeholderOnly);
  when(inputs.length > 0 && !has(jsAll, /(valid|check|test\(|pattern|error|خطأ|صالح)/i) && !has(markup, /(required|pattern|minlength)/i), "no-validation", "بلا تحقق من المدخلات");
  when(has(jsAll, /fetch\s*\(/) && !has(jsAll, /(disabled|loading|pending|isSubmitting)/i), "double-submit", "إرسال بلا تعطيل الزر");
  when(hasForm && inputs.length > 0 && !has(src, /(تم الإرسال|نجاح|success|شكرًا|شكرا|sent|received)/i), "no-success", "نموذج بلا رسالة نجاح");
  when(has(markup, /<input\b(?![^>]*\btype\s*=)/i) && stats.inputs > 2, "input-types", "حقول بلا type مناسب");

  /* ---------- navigation ---------- */
  when(appish && count(markup, /<a\b[^>]*href/gi) > 3 && !has(src, /aria-current|\[data-active|\.active|\.is-active/) && !has(jsAll, /(aria-current|active|classList)/i), "no-active-nav", "بلا حالة نشطة للتنقل");
  when(stats.mediaQueries === 0 && stats.nodes > 80, "no-mobile-nav", "لا يوجد أي @media — قائمة الموبايل مكسورة");
  when(!has(cssAll, /@media[^{]*max-width\s*:\s*(?:4[0-8]\d|5\d\d)px/) && stats.nodes > 80, "breaks-360", "لا يوجد breakpoint صغير");
  when(stats.nodes > 200 && !has(markup, /(breadcrumb|مسار|الرئيسية\s*\/|<nav[^>]*aria-label)/i), "no-breadcrumb", "موقع عميق بلا مسار تنقّل");
  when(stats.nodes > 250 && !has(markup, /type\s*=\s*["']search["']|placeholder\s*=\s*["'][^"']*(بحث|search)/i), "no-search", "محتوى كثير بلا بحث");

  /* ---------- data ---------- */
  // a plain server-side form (action=…) does not need client persistence
  when(appish && stats.inputs > 2 && !has(jsAll, /localStorage|indexedDB|sessionStorage/) && !(hasForm && /<form[^>]+action\s*=/i.test(markup)), "no-persist", "بيانات المستخدم لا تُحفظ");
  const arrSizes = [...jsAll.matchAll(/\[[^\]]{0,4000}\]/g)].map((m) => count(m[0], /\{/g));
  when(arrSizes.length > 0 && Math.max(...arrSizes) <= 4 && stats.nodes > 150, "thin-data", `أكبر مصفوفة ${Math.max(...arrSizes)} عنصر`);
  when(has(jsAll, /(price|total|amount|سعر|مجموع)/i) && has(jsAll, /parseFloat|toFixed\([^)]*\)\s*[-+*\/]|Math\.round\([^)]*\*\s*100\)/) && !has(jsAll, /cents|Cent|دج\s*\*\s*100|integer/i), "float-money", "حسابات الفلوس بأرقام عشرية");
  when(has(markup, /<table\b/) && !has(jsAll, /(sort|page|pagination|ترتيب|صفحة)/i), "no-table-tools", "جدول بلا ترتيب أو ترقيم");

  /* ---------- media ---------- */
  const badSrc = [...markup.matchAll(/src\s*=\s*["'](#|["']|\s*|https?:\/\/(?:example|test|placeholder|unsplash\.com\/photo-[a-z]{4,})[^"']*)["']/gi)].length;
  when(badSrc > 0, "broken-media", `${badSrc} رابط وسائط فارغ أو وهمي`, badSrc);
  when(count(markup, /<img\b[^>]*\.(png|jpe?g|gif)\b[^>]*class="[^"]*icon/gi) > 0, "raster-icons", "أيقونات صور بدل SVG");
  when(has(src, /autoplay/i) || has(jsAll, /new Audio\([^)]*\)\.play\(\)/) && !has(jsAll, /(click|pointerdown|gesture)/i), "audio-gesture", "صوت يعمل بلا تفاعل");
  when(stats.images > 2 && !has(cssAll, /aspect-ratio/) && !/<img[^>]+height\s*=/i.test(markup), "no-aspect", "وسائط بلا نسبة ثابتة");

  /* ---------- trust ---------- */
  when(!has(markup, /(mailto:|tel:|contact|اتصل|تواصل|@[\w.]+\.\w+)/i), "no-contact", "بلا وسيلة اتصال");
  {
    const plain = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
    const brandTitle = plain(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(src)?.[1] ?? "").split(/[|—–-]/)[0].trim();
    const brandLogo = plain(/<(?:a|div|span)[^>]*class="[^"]*(?:logo|brand)[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/i.exec(markup)?.[1] ?? "");
    /* an <h1> only counts as the brand when it sits in the header/nav — inside
       <main> it is a headline/slogan, and flagging that is a false positive */
    const headArea = /<main\b/i.test(markup) ? markup.slice(0, markup.search(/<main\b/i)) : markup;
    const brandH1 = plain(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(headArea)?.[1] ?? "");
    const words = (x: string) => new Set(x.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
    const a = words(brandTitle);
    const clash = (b: string) => b.trim().length > 2 && a.size > 0 && [...words(b)].every((w) => !a.has(w));
    when((clash(brandH1) || clash(brandLogo)) && brandTitle.length > 0, "brand-drift", `العنوان «${brandTitle.slice(0, 24)}» لا يطابق ${clash(brandLogo) ? "الشعار" : "H1"} «${(clash(brandLogo) ? brandLogo : brandH1).slice(0, 24)}»`);
  }
  when(!has(markup, /(privacy|terms|خصوصية|شروط|سياسة)/i), "no-legal", "بلا خصوصية وشروط");
  when(has(markup, /(checkout|دفع|شراء|buy|payment)/i) && !has(markup, /(ضمان|آمن|secure|lock|visa|cib|dahabia|eddahabia)/i), "no-trust-signals", "دفع بلا إشارات أمان");

  /* ---------- mobile ---------- */
  when(!has(cssAll, /16px|1rem/) && stats.inputs > 0 && has(cssAll, /font-size\s*:\s*1[0-4]px/), "input-zoom", "حقول أصغر من 16px (زووم iOS)");
  when(has(cssAll, /position\s*:\s*fixed[^}]*bottom\s*:\s*0/) && !has(cssAll, /padding-bottom\s*:\s*(?:[6-9]\d|1\d\d)px|env\(safe-area-inset-bottom\)/), "fixed-overlap", "شريط سفلي ثابت يغطي المحتوى");
  when(stats.buttons > 3 && has(cssAll, /@media/) && !has(cssAll, /bottom\s*:\s*0|sticky|fixed/) && stats.nodes > 200, "thumb-zone", "الدعوة الرئيسية بعيدة عن الإبهام");

  /* ---------- code ---------- */
  const jsEverywhere = `${jsClean}\n${handlers}`;
  when(has(jsEverywhere, /\b(alert|confirm|prompt)\s*\(/), "uses-alert", `${count(jsEverywhere, /\b(alert|confirm|prompt)\s*\(/g)}× حوار متصفح`);
  when(has(jsEverywhere, /console\.(log|debug|info)\s*\(/), "has-console", `${count(jsEverywhere, /console\.(log|debug|info)\s*\(/g)}× console.log`);
  const legacyTags = count(markup, /<(font|center|marquee|blink|frame|frameset|big|tt|strike)\b/gi);
  const legacyAttrs = count(markup, /\s(bgcolor|cellpadding|cellspacing|align|valign|hspace|vspace|border)\s*=\s*["']?[^\s"'>]+/gi);
  when(legacyTags + legacyAttrs > 0, "legacy-html", `${legacyTags} وسم قديم · ${legacyAttrs} سمة تقديمية`, legacyTags + legacyAttrs);
  const inlineStyles = count(markup, /\sstyle\s*=\s*["']/gi);
  when(inlineStyles > Math.max(6, Math.round(stats.nodes * 0.25)), "inline-styles", `${inlineStyles} style="" من ${stats.nodes} عنصر`, inlineStyles);
  const ids = new Set([...markup.matchAll(/\sid\s*=\s*["']([\w-]+)["']/gi)].map((m) => m[1]));
  const created = new Set([...jsAll.matchAll(/setAttribute\(\s*["']id["']\s*,\s*["']([\w-]+)|\bid\s*=\s*["']([\w-]+)["']/g)].map((m) => m[1] ?? m[2]));
  const missingIds = [...jsClean.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)|querySelector\(\s*["']#([\w-]+)["']/g)]
    .map((m) => m[1] ?? m[2])
    .filter((id) => id && !ids.has(id) && !created.has(id));
  when(missingIds.length > 0, "missing-ids", missingIds.slice(0, 5).map((x) => `#${x}`).join("، "), missingIds.length);
  when(has(jsClean, /(localStorage|navigator\.clipboard|AudioContext|requestFullscreen|geolocation)/) && !has(jsAll, /try\s*\{/), "no-trycatch", "APIs متصفح بلا try/catch");
  when(has(jsClean, /^\s*import\s+[\w{*"]/m) || has(jsClean, /^\s*export\s+(default|const|function)/m), "es-modules", "import/export في ملف HTML واحد");
  when(count(markup, /class\s*=\s*["'][^"']*(card|item|tile)["'][^"']*>\s*[\s\S]{0,400}?<\/div>/gi) > 8 && dupRatio(markup) > 0.35, "dup-blocks", `${Math.round(dupRatio(markup) * 100)}% كتل مكرّرة`);
  when(count(cssAll, /#[0-9a-f]{6}\b/gi) > 24 && stats.tokens < 8, "magic-numbers", "قيم سحرية كثيرة بلا رموز");

  /* ---------- build the report ---------- */
  const findings: Finding[] = [];
  for (const h of hits) {
    const rule: DesignRule | undefined = RULE_BY_DETECT.get(h.detect);
    if (!rule) continue;
    findings.push({
      ruleId: rule.id,
      detect: h.detect,
      cat: rule.cat,
      sev: rule.sev,
      ar: rule.ar,
      en: rule.en,
      fix: rule.fix,
      evidence: h.evidence,
      count: h.count,
      weight: SEV_WEIGHT[rule.sev] * (rule.w / 5) * (1 + Math.min(1.2, Math.log2(Math.max(1, h.count)) * 0.22)),
    });
  }
  // de-duplicate identical rules (a rule may fire twice, e.g. no-focus)
  const byRule = new Map<string, Finding>();
  for (const f of findings) {
    const prev = byRule.get(f.ruleId);
    if (!prev || f.weight > prev.weight) byRule.set(f.ruleId, { ...f, count: Math.max(f.count, prev?.count ?? 0), evidence: prev ? `${prev.evidence} · ${f.evidence}` : f.evidence });
  }
  const uniq = Array.from(byRule.values()).sort((a, b) => SEV_WEIGHT[b.sev] - SEV_WEIGHT[a.sev] || b.weight - a.weight);

  /* Score = exponential decay on the total weight. A linear penalty pins every
     real-world page at 0; decay keeps the scale usable: one critical ≈ -18,
     a handful of minors ≈ -10, and a clean document stays at 100. */
  const penalty = uniq.reduce((s, f) => s + f.weight, 0);
  const score = clamp(Math.round(100 * Math.exp(-penalty / SCORE_K)), 0, 100);

  const byCat: CatScore[] = CATS.map((cat) => {
    const list = uniq.filter((f) => f.cat === cat);
    const p = list.reduce((s, f) => s + f.weight, 0);
    return { cat, ar: CAT_AR[cat], score: clamp(Math.round(100 * Math.exp(-p / CAT_K)), 0, 100), findings: list.length, worst: list[0]?.sev ?? null };
  }).sort((a, b) => a.score - b.score);

  const grade: AuditReport["grade"] = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";

  return { score, grade, findings: uniq, byCat, stats, ruleIds: uniq.map((f) => f.ruleId) };
}

/* ------------------------------------------------------------------ *
 * small utilities
 * ------------------------------------------------------------------ */
function luminanceOf(hex: string): number {
  const rgb = toRgb(hex);
  return rgb ? lum(rgb) : 0;
}

function pickColor(css: string, vars: string[], fallback?: RegExp): string | null {
  for (const v of vars) {
    const m = new RegExp(`${v.replace(/[-]/g, "\\-")}\\s*:\\s*(#[0-9a-f]{3,8}|rgba?\\([^)]+\\)|white|black)`, "i").exec(css);
    if (m) return m[1];
  }
  if (fallback) {
    const m = fallback.exec(css);
    if (m) {
      const v = m[1].trim();
      if (/^(#[0-9a-f]{3,8}|rgba?\([^)]+\)|white|black)$/i.test(v)) return v;
      // a var() reference: resolve it from :root
      const name = /var\(\s*(--[\w-]+)/.exec(v)?.[1];
      if (name) return pickColor(css, [name]);
    }
  }
  return null;
}

/** Share of near-duplicate block-level chunks (padding / copy-paste detector). */
export function dupRatio(markup: string): number {
  const chunks = markup
    .split(/<\/(?:div|li|article|section|tr)>/i)
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter((c) => c.length > 80);
  if (chunks.length < 4) return 0;
  const seen = new Map<string, number>();
  for (const c of chunks) seen.set(c, (seen.get(c) ?? 0) + 1);
  let dup = 0;
  for (const n of seen.values()) if (n > 1) dup += n - 1;
  return dup / chunks.length;
}

/** A short human summary in Arabic (used in chat and in the improve prompt). */
export function auditSummary(rep: AuditReport): string {
  const worst = rep.findings.slice(0, 5).map((f) => `· ${f.ar} (${f.evidence})`).join("\n");
  const cats = rep.byCat.filter((c) => c.findings > 0).slice(0, 4).map((c) => `${c.ar} ${c.score}/100`).join(" · ");
  return `النقطة ${rep.score}/100 (${rep.grade}) — ${rep.findings.length} ملاحظة.\n${cats ? `أضعف المحاور: ${cats}\n` : ""}${worst}`;
}

/** The exact improvement brief handed to the model. */
export function improveBrief(rep: AuditReport, opts: { lang: string; keep?: string } = { lang: "ar" }): string {
  const list = rep.findings
    .slice(0, 40)
    .map((f, i) => `${i + 1}. [${f.sev.toUpperCase()} · ${f.cat}] ${f.en}\n   EVIDENCE: ${f.evidence}\n   FIX: ${f.fix}`)
    .join("\n");
  return `AUDIT OF THE CURRENT PROJECT — score ${rep.score}/100 (${rep.grade}), ${rep.findings.length} problems.

STATS: ${rep.stats.lines.toLocaleString("en")} lines · ${Math.round(rep.stats.bytes / 1024)} KB · ${rep.stats.nodes} nodes · ${rep.stats.images} images · ${rep.stats.buttons} buttons · ${rep.stats.inputs} inputs · ${rep.stats.mediaQueries} media queries · ${rep.stats.tokens} CSS tokens · arabic=${rep.stats.arabic} rtl=${rep.stats.rtl}

${list}

${opts.keep ? `MUST KEEP: ${opts.keep}` : "MUST KEEP: every existing feature, screen, dataset, id, class name and text — you are improving the design and quality, not rewriting the product."}
LANGUAGE: ${opts.lang === "ar" ? "Arabic (RTL)" : opts.lang}. Return the COMPLETE improved file, from <!doctype html> to </html>, in one \`\`\`html block, nothing else.`;
}

/* ------------------------------------------------------------------ *
 * improvement stream protocol (shared by /api/design/improve and the studio UI)
 * ------------------------------------------------------------------ */
export type ImproveEvent =
  | { t: "start"; model: string; before: number; findings: number; lines: number }
  | { t: "stage"; label: string }
  | { t: "delta"; d: string }
  | { t: "html"; html: string; lines: number; bytes: number }
  | { t: "audit"; report: AuditReport }
  | { t: "live"; url: string; slug: string }
  | { t: "done"; before: number; after: number; model: string; ms: number }
  | { t: "error"; code: string; detail?: string };

/** Buffers the NDJSON improvement stream into events (client-side twin). */
export function makeImproveParser(onEvent: (e: ImproveEvent) => void) {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line) as ImproveEvent);
        } catch {
          /* partial line */
        }
      }
      nl = buf.indexOf("\n");
    }
  };
}

/** Looks up one rule (used by the UI to explain a finding). */
export function ruleById(id: string): DesignRule | undefined {
  return RULE_BY_ID.get(id);
}
