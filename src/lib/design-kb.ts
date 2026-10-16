/**
 * NEXUS v19 — قاعدة معرفة التصميم (design knowledge base)
 * ---------------------------------------------------------------------------
 * The engine that makes Nexus "as strong as Claude/Kimi at improving websites"
 * is not a vibe: it is a corpus of concrete, checkable rules. Every rule says
 * what is wrong, how the analyzer detects it, what the model must do about it,
 * and how much it costs the score.
 *
 * 96 rules across 19 categories, written for real projects (Arabic/RTL first).
 * Pure data + pure helpers: isomorphic.
 */

export type DesignCat =
  | "layout"
  | "color"
  | "type"
  | "space"
  | "motion"
  | "a11y"
  | "ux"
  | "copy"
  | "conv"
  | "perf"
  | "seo"
  | "ar"
  | "forms"
  | "nav"
  | "data"
  | "media"
  | "trust"
  | "mobile"
  | "code";

export type Severity = "critical" | "major" | "minor" | "polish";

export type DesignRule = {
  id: string;
  cat: DesignCat;
  sev: Severity;
  /** the rule, in Arabic — shown to the user */
  ar: string;
  /** short English form — goes into the model prompt */
  en: string;
  /** analyzer key (see web-audit.ts) — optional: some rules are prompt-only */
  detect?: string;
  /** what the model must do */
  fix: string;
  /** score weight 1..10 */
  w: number;
};

export const CAT_AR: Record<DesignCat, string> = {
  layout: "التخطيط",
  color: "الألوان",
  type: "الخطوط",
  space: "المسافات",
  motion: "الحركة",
  a11y: "إتاحة الوصول",
  ux: "تجربة المستخدم",
  copy: "النصوص",
  conv: "التحويل",
  perf: "الأداء",
  seo: "SEO",
  ar: "العربية و RTL",
  forms: "النماذج",
  nav: "التنقّل",
  data: "البيانات",
  media: "الوسائط",
  trust: "الثقة",
  mobile: "الموبايل",
  code: "جودة الكود",
};

export const SEV_AR: Record<Severity, string> = {
  critical: "حاسم",
  major: "كبير",
  minor: "متوسط",
  polish: "لمسة",
};

export const SEV_WEIGHT: Record<Severity, number> = { critical: 10, major: 6, minor: 3, polish: 1 };

const r = (
  id: string,
  cat: DesignCat,
  sev: Severity,
  ar: string,
  en: string,
  detect: string | undefined,
  fix: string,
  w: number
): DesignRule => ({ id, cat, sev, ar, en, detect, fix, w });

export const DESIGN_RULES: DesignRule[] = [
  /* ───────── layout ───────── */
  r("lay-viewport", "layout", "critical", "ما كاينش viewport meta — الموقع يتكسر في الموبايل", "missing viewport meta tag", "no-viewport", 'Add <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">.', 10),
  r("lay-100dvh", "layout", "major", "استعمل 100dvh بدل 100vh باش ما يتقطعش المحتوى في الموبايل", "100vh instead of 100dvh", "uses-100vh", "Replace 100vh with 100dvh (fallback: min-height:100vh; min-height:100dvh).", 6),
  r("lay-overflow-x", "layout", "critical", "فيها سكرول أفقي — شيء يخرج من الشاشة", "horizontal overflow", "overflow-x", "Set html,body{overflow-x:hidden;max-width:100%} and fix the element that is wider than the viewport (usually a fixed width or a negative margin).", 9),
  r("lay-container", "layout", "major", "مافيهاش عرض أقصى للمحتوى — الأسطر طويلة بزاف", "no content max-width", "no-max-width", "Wrap content in a container with max-width:min(1200px,100%-32px) and center it; measure 60–75 characters per line for text.", 6),
  r("lay-grid", "layout", "minor", "التخطيط يعتمد على float/inline-block بدل grid/flex", "legacy layout technique", "legacy-layout", "Rebuild the layout with CSS grid or flexbox; keep the same visual result but make it responsive by column count, not by fixed widths.", 4),
  r("lay-safe-area", "layout", "minor", "ما استعملتش safe-area-inset — المحتوى تحت شريط الموبايل", "missing safe-area insets", "no-safe-area", "Add padding-bottom:env(safe-area-inset-bottom) and padding-top:env(safe-area-inset-top) to fixed bars.", 3),
  r("lay-sticky", "layout", "polish", "الشريط العلوي ما ثابتش — يضيع مع السكرول", "header not sticky", "no-sticky", "Make the primary header position:sticky;top:0 with a blurred background and a hairline border that appears on scroll.", 1),
  r("lay-z", "layout", "minor", "طبقات z-index فوضوية — عناصر تختفي فوق بعضها", "z-index chaos", "z-chaos", "Define a z-index scale in :root (--z-base/--z-sticky/--z-modal/--z-toast) and use only those tokens.", 3),

  /* ───────── color ───────── */
  r("col-tokens", "color", "major", "الألوان مكتوبة في كل مكان بدل نظام رموز (tokens)", "no colour tokens", "no-color-tokens", "Move every colour into :root custom properties (--bg, --surface, --surface-2, --text, --muted, --accent, --accent-2, --line, --ok, --warn, --err) and reference them everywhere.", 7),
  r("col-contrast", "color", "critical", "تباين ضعيف بين النص والخلفية — ما يتقراش", "low contrast text", "low-contrast", "Raise text/background contrast to at least 4.5:1 for body text and 3:1 for large text and UI borders; verify muted text too.", 9),
  r("col-flat", "color", "major", "التصميم مسطّح: خلفية واحدة، بلا عمق ولا ظلال", "flat single-colour surfaces", "flat-surface", "Add depth: 2–3 surface levels, soft layered shadows (0 18px 44px -28px rgba(0,0,0,.75)), a subtle border (1px rgba(255,255,255,.08)) and a gradient or radial glow behind the hero.", 7),
  r("col-accent", "color", "major", "ماكاينش لون تمييز واضح للأزرار الرئيسية", "no clear accent colour", "no-accent", "Pick one accent (and one secondary), use the accent ONLY for primary actions, active states, links and key data; everything else stays neutral.", 6),
  r("col-rainbow", "color", "minor", "ألوان كثيرة متنافسة — الصفحة تشبه السيرك", "too many saturated hues", "too-many-hues", "Reduce to 1 accent + 1 secondary + neutrals; desaturate decorative colours; keep semantic colours (ok/warn/err) only for state.", 4),
  r("col-hardcode", "color", "minor", "ألوان ثابتة ما تتبدلش مع الوضع الليلي", "hard-coded colours block theming", "hard-colors", "Reference tokens only, then add a [data-theme] or prefers-color-scheme block that swaps the token values.", 3),

  /* ───────── typography ───────── */
  r("typ-scale", "type", "major", "ماكاينش سلّم أحجام واضح — العناوين والنصوص عشوائية", "no type scale", "no-type-scale", "Define a fluid type scale with clamp(): 13/14/16/18/22/28/36/48px, one font-weight per level (400 body, 700 subheads, 800–900 display).", 6),
  r("typ-lineheight", "type", "major", "سطور النص العربي مضغوطة — القراءة متعبة", "tight line-height for Arabic", "tight-leading", "Arabic body text needs line-height 1.8–2.0 and font-size ≥15px; Latin 1.55–1.7. Headings can go 1.15–1.3.", 6),
  r("typ-stack", "type", "minor", "ماكاينش خط احتياطي عربي — النص يظهر بخط النظام الافتراضي", "no Arabic font stack", "no-ar-font", 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic","Noto Kufi Arabic","Geeza Pro",Tahoma,sans-serif. Load at most 2 webfonts with display=swap.', 4),
  r("typ-measure", "type", "minor", "أسطر طويلة بزاف — العين تتوه بين السطور", "line length too long", "long-lines", "Cap text measure at 60–75 characters (max-width:65ch for paragraphs).", 3),
  r("typ-nums", "type", "polish", "الأرقام تهتز في الجداول والعدّادات", "numbers not tabular", "no-tabular-nums", "Add font-variant-numeric:tabular-nums to prices, counters, tables and timers.", 2),
  r("typ-anti", "type", "polish", "النص ما نقيش على الشاشات", "no font smoothing", "no-smoothing", "-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility on body.", 1),

  /* ───────── spacing ───────── */
  r("sp-grid", "space", "major", "المسافات عشوائية (13px هنا و27px هناك)", "no spacing grid", "no-space-scale", "Use one 8px spacing scale (--sp-1:4, --sp-2:8, --sp-3:12, --sp-4:16, --sp-6:24, --sp-8:32, --sp-12:48, --sp-16:64) and only those values for margins/paddings/gaps.", 6),
  r("sp-dense", "space", "major", "العناصر ملصوقة ببعض — الصفحة خانقة", "cramped spacing", "cramped", "Increase section padding to 48–96px on desktop (32–48 mobile), card padding to 20–28px, and gap between cards to 16–24px.", 6),
  r("sp-empty", "space", "minor", "مساحات فارغة كبيرة بلا سبب", "unbalanced whitespace", "unbalanced", "Group related items (8–16px) and separate groups (32–64px); whitespace should follow hierarchy, not be uniform.", 2),
  r("sp-radius", "space", "minor", "زوايا مختلفة في كل عنصر", "inconsistent radii", "mixed-radius", "Three radii only: --r-sm 10px (inputs, chips), --r-md 16px (cards), --r-lg 24px (modals, hero panels); pills 999px.", 4),

  /* ───────── motion ───────── */
  r("mot-reduced", "motion", "major", "ما احترمتش prefers-reduced-motion — خطر على بعض المستخدمين", "no reduced-motion support", "no-reduced-motion", "Add @media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important;scroll-behavior:auto!important}}.", 6),
  r("mot-timing", "motion", "minor", "الحركات بطيئة أو بخطية — الإحساس ثقيل", "poor motion timing", "slow-motion", "Use 150–250ms for micro-interactions and 260–420ms for panels, with cubic-bezier(.22,1,.36,1); never linear for UI.", 3),
  r("mot-curve", "motion", "polish", "الانتقالات خطّية — الحركة تحسّ ميكانيكية", "linear easing everywhere", "linear-motion", "Give every transition an easing curve: cubic-bezier(.22,1,.36,1) for entrances, cubic-bezier(.4,0,.2,1) for state changes. Never `linear` on UI.", 2),
  r("mot-hover", "motion", "minor", "العناصر ما تتفاعلش مع الماوس واللمس", "no hover/active feedback", "no-hover", "Every interactive element needs hover (lift 1–2px + border/bg change), active (scale .98) and focus-visible states.", 4),
  r("mot-reveal", "motion", "polish", "الصفحة تظهر دفعة واحدة بلا حياة", "no scroll reveals", "no-reveal", "Add IntersectionObserver reveals (opacity 0→1, translateY 12px→0, 420ms, 60ms stagger) to sections and cards.", 2),
  r("mot-cl", "motion", "minor", "العناصر تقفز عند التحميل (layout shift)", "layout shift on load", "layout-shift", "Reserve space for images (aspect-ratio), fonts (font-display:swap + size-adjust) and skeletons so nothing jumps.", 4),

  /* ───────── accessibility ───────── */
  r("a11y-alt", "a11y", "critical", "صور بلا نص بديل — القارئ الشاشي ما يشوفش", "images without alt text", "img-no-alt", 'Every <img> gets a meaningful alt in the page language; decorative images get alt="" and aria-hidden="true".', 9),
  r("a11y-focus", "a11y", "critical", "ماكاينش مؤشر تركيز واضح — التنقل بالكيبورد مستحيل", "no visible focus styles", "no-focus", "Add :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:inherit} and never outline:none without a replacement.", 9),
  r("a11y-tap", "a11y", "major", "أهداف اللمس صغيرة — 30px ما تكفيش", "tap targets smaller than 44px", "small-targets", "Make every tap target at least 44×44 CSS px (buttons, links in lists, icon buttons) with 8px spacing between them.", 7),
  r("a11y-landmark", "a11y", "major", "بلا دلالات: كل شيء div", "no semantic landmarks", "no-semantics", "Use <header>,<nav>,<main>,<section>,<article>,<aside>,<footer> with aria-label where needed, and real <button>/<a> for actions.", 6),
  r("a11y-h", "a11y", "minor", "ترتيب العناوين مقطوع (h1 ثم h4)", "broken heading order", "heading-order", "One <h1>, then no skipped levels; headings describe the section, they are not styling hooks.", 4),
  r("a11y-lang", "a11y", "major", "ماكاينش lang/dir صحيحين", "missing lang/dir on <html>", "no-lang", 'Set <html lang="ar" dir="rtl"> for Arabic (lang="fr"/"en" otherwise) and lang on any foreign-language fragment.', 6),
  r("a11y-live", "a11y", "minor", "التغييرات الحية ما تُعلَنش", "dynamic updates not announced", "no-live", 'Add role="status" aria-live="polite" to toasts, timers, price totals and validation messages.', 3),
  r("a11y-aria", "a11y", "minor", "أزرار بلا اسم يمكن قراءته", "controls without accessible name", "no-aria", "Icon-only buttons need aria-label; toggles need aria-pressed; tabs need role/aria-selected; inputs need a real <label>.", 4),

  /* ───────── ux ───────── */
  r("ux-empty", "ux", "minor", "ماكاينش حالة «فارغ» — قائمة بلا عناصر تُظهر بياضًا", "no empty state", "no-empty-state", "Design an empty state for every list/view: icon, one honest sentence, and the action that fills it.", 3),
  r("ux-loading", "ux", "minor", "بلا حالة تحميل — المستخدم ما يعرفش واش يخدم", "no loading state", "no-loading-state", "Add skeletons (shimmer) for content and a disabled+spinner state for every async button; never leave the UI frozen.", 3),
  r("ux-error", "ux", "minor", "الأخطاء ما تظهرش للمستخدم", "no error state", "no-error-state", "Every fetch needs a visible error state with the reason in plain language and a «عاود» retry button.", 3),
  r("ux-toast", "ux", "minor", "ماكاينش إشعار بعد النجاح", "no success feedback", "no-toast", "Confirm every completed action with a toast (auto-dismiss 3–4s) and undo where it is destructive.", 4),
  r("ux-dead", "ux", "critical", "أزرار ما تدير والو", "dead buttons / links", "dead-control", "Wire every control: if a feature is out of scope, remove the button or make it clearly disabled with a tooltip explaining why.", 9),
  r("ux-confirm", "ux", "minor", "الحذف بلا تأكيد", "destructive action without confirmation", "no-confirm", "Confirm destructive actions in a modal (never window.confirm) showing exactly what will be lost.", 3),
  r("ux-scroll", "ux", "polish", "السكرول ما ناعمش بين الأقسام", "no smooth anchor scrolling", "no-smooth-scroll", "html{scroll-behavior:smooth} plus scroll-margin-top on sections so the sticky header does not cover them.", 1),
  r("ux-back", "ux", "minor", "ماكاينش رجوع واضح من الشاشات الفرعية", "no way back", "no-back", "Every sub-view needs a visible back control and keeps the previous scroll position.", 3),

  /* ───────── copy ───────── */
  r("cp-lorem", "copy", "critical", "نص تجريبي (lorem ipsum) في موقع حقيقي", "placeholder copy", "lorem", "Replace every placeholder with real, specific copy in the project language: real names, real prices, real benefits.", 9),
  r("cp-vague", "copy", "major", "العناوين عامة: «حلول مبتكرة» بلا معنى", "vague headlines", "vague-copy", "Rewrite headlines to state the outcome and the audience: what changes for the user, in how long, with what proof.", 6),
  r("cp-cta", "copy", "major", "أزرار الدعوة غامضة («اضغط هنا»)", "weak CTA labels", "weak-cta", "CTA labels must be verbs with a benefit: «ابدأ gratis الآن», «احسب توفيرك», «اطلب عرض سعر» — max 4 words.", 6),
  r("cp-mixed", "copy", "minor", "لغتان مخلوطتان في نفس الجملة بلا سبب", "mixed languages", "mixed-lang", "Keep one language per block; translate UI labels fully; put foreign terms in <span lang> only when they are proper nouns.", 3),
  r("cp-long", "copy", "minor", "فقرات طويلة بلا تقسيم", "walls of text", "wall-of-text", "Break text into 2–4 sentence paragraphs, add subheads every 2–3 paragraphs, and turn lists of 3+ items into bullets or cards.", 3),

  /* ───────── conversion ───────── */
  r("cv-hero", "conv", "minor", "الواجهة الأولى ما توضّحش العرض في 5 ثوانٍ", "hero does not state the offer", "weak-hero", "Above the fold: one promise headline, one proof sub-headline, one primary CTA, one secondary, and a product visual.", 4),
  r("cv-one", "conv", "minor", "أزرار رئيسية كثيرة متنافسة", "multiple competing primary CTAs", "many-cta", "One primary action per screen; secondary actions get a quieter style (ghost/outline).", 4),
  r("cv-proof", "conv", "minor", "ماكاينش دليل اجتماعي (آراء، أرقام، شعارات)", "no social proof", "no-proof", "Add proof: numbers (clients, orders, rating), 3–6 testimonials with names and roles, and a logo/partner strip.", 3),
  r("cv-price", "conv", "minor", "الأسعار مخفية أو بلا عملة", "prices unclear", "no-price", "Show prices with the currency (دج / € / $), the period, what is included, and a monthly/yearly toggle with real maths.", 2),
  r("cv-risk", "conv", "minor", "ماكاينش تقليل للمخاطرة", "no risk reversal", "no-guarantee", "Add guarantee/free-trial/cancellation language next to the CTA and answer the top objection in the FAQ.", 2),
  r("cv-form", "conv", "major", "النموذج طويل ومعقّد", "form too long", "long-form", "Cut to the fields you truly need, one column, inline labels, live validation, a clear submit label and a success state.", 6),

  /* ───────── performance ───────── */
  r("pf-imgsize", "perf", "major", "صور بلا أبعاد — تحميل وثبات سيئ", "images without width/height", "img-no-size", "Set width/height or aspect-ratio on every image, loading=\"lazy\" below the fold, decoding=\"async\", and serve modern formats.", 6),
  r("pf-cdn", "perf", "minor", "مكتبات خارجية كثيرة أو بلا تثبيت إصدار", "unpinned external libraries", "unpinned-cdn", "Pin versions (cdnjs/jsdelivr), drop unused libraries, and prefer native APIs (IntersectionObserver, fetch, Web Audio).", 4),
  r("pf-heavy", "perf", "minor", "ملف ضخم واحد يبطّئ التحميل", "very large single file", "huge-file", "Move data into a JSON module or generate it procedurally; compress repeated markup with a render function; keep images as SVG/CSS.", 3),
  r("pf-preload", "perf", "polish", "ماكاينش preload للخط/الصورة الأولى", "no preload for LCP asset", "no-preload", 'Add <link rel="preload"> for the hero image and the primary font, and preconnect to the origins you use.', 2),
  r("pf-reflow", "perf", "minor", "حركات تسبب إعادة تخطيط (top/left/width)", "animations trigger reflow", "reflow-anim", "Animate only transform and opacity; use will-change sparingly; batch DOM writes with requestAnimationFrame.", 4),

  /* ───────── seo ───────── */
  r("seo-title", "seo", "major", "ماكاينش عنوان صفحة وصف", "missing title/description", "no-meta", "Add a unique <title> (≤60 chars) and <meta name=description> (≤155 chars) in the page language, stating the offer and place.", 6),
  r("seo-og", "seo", "minor", "بلا بطاقات مشاركة", "no Open Graph tags", "no-og", "Add og:title, og:description, og:image, og:type and twitter:card so shared links look right.", 2),
  r("seo-h1", "seo", "major", "ماكاينش H1 أو فيه كلمات مفتاحية ناقصة", "missing or empty h1", "no-h1", "One <h1> per page containing the primary keyword and the place/audience; outline the page with h2/h3.", 5),
  r("seo-struct", "seo", "polish", "بلا بيانات منظمة", "no structured data", "no-jsonld", "Add JSON-LD (Organization/Product/FAQ/LocalBusiness) matching the visible content.", 1),

  /* ───────── arabic / rtl ───────── */
  r("ar-dir", "ar", "critical", "الموقع عربي لكن الاتجاه LTR", "Arabic page rendered LTR", "rtl-missing", 'Set dir="rtl" on <html> and rebuild the layout with logical properties (margin-inline-start, padding-inline-end, inset-inline).', 10),
  r("ar-logical", "ar", "major", "استعمل left/right بدل الخصائص المنطقية — RTL يتكسر", "physical left/right in an RTL layout", "physical-props", "Replace left/right/margin-left/padding-right/border-left with inset-inline-start/end, margin-inline-*, padding-inline-*, border-inline-*.", 6),
  r("ar-font", "ar", "major", "الخط العربي غير مناسب أو صغير", "poor Arabic typography", "ar-type", "Use a real Arabic face (Noto Sans Arabic / Noto Kufi Arabic / Cairo / IBM Plex Sans Arabic), ≥15px body, line-height 1.8+, and avoid letter-spacing on Arabic.", 6),
  r("ar-nums", "ar", "minor", "الأرقام والأوقات غير منسّقة للجمهور المحلي", "numbers/dates not localised", "ar-nums", "Use toLocaleString('ar-DZ') / toLocaleDateString('ar-DZ') for prices, dates and counts; keep currency (دج) after the number.", 2),
  r("ar-mix", "ar", "minor", "عناصر لاتينية داخل RTL بلا عزل", "unisolated LTR fragments", "ar-bidi", 'Wrap URLs, code, emails and Latin brand names in <span dir="ltr"> or use unicode-bidi:isolate.', 3),
  r("ar-copy", "ar", "polish", "الترجمة حرفية وركيكة", "stiff machine-translated Arabic", "ar-stiff", "Write natural Modern Standard Arabic (or Darija when the brand is casual): short verbs, no calques, correct hamza and ta marbuta.", 2),

  /* ───────── forms ───────── */
  r("fm-label", "forms", "critical", "حقول بلا تسمية — ما يعرفش المستخدم واش يكتب", "inputs without labels", "input-no-label", "Every input gets a visible <label for> (placeholder is not a label) plus autocomplete/inputmode/type.", 9),
  r("fm-placeholder", "forms", "minor", "placeholder وحده ما يكفيش — يختفي كي يكتب المستخدم", "placeholder used as the only label", "placeholder-only", "Keep the placeholder as an example, and add a real <label for> (or aria-label) that stays visible while typing.", 4),
  r("fm-valid", "forms", "minor", "ماكاينش تحقق فوري من المدخلات", "no inline validation", "no-validation", "Validate on blur and on submit: inline message under the field, aria-invalid, red border, and keep the button disabled until valid.", 4),
  r("fm-submit", "forms", "minor", "الزر ما يتعطلش أثناء الإرسال — إرسال مزدوج", "no submit guard", "double-submit", "Disable the submit button while pending, show a spinner, and re-enable with the error if it fails.", 4),
  r("fm-success", "forms", "polish", "بلا رسالة نجاح بعد الإرسال", "no success state", "no-success", "Show a success panel (what happens next, when, and a reference) and persist it so a refresh does not lose it.", 2),
  r("fm-type", "forms", "minor", "أنواع الحقول غلط (نص بدل tel/email/number)", "wrong input types", "input-types", "Use type=email/tel/number/date/url with inputmode and autocomplete so mobile keyboards help the user.", 4),

  /* ───────── navigation ───────── */
  r("nv-active", "nav", "minor", "ما تعرفش فين راك — بلا حالة نشطة", "no active nav state", "no-active-nav", "Highlight the current section/page in the nav (colour + weight + underline/dot) and keep it in sync while scrolling.", 3),
  r("nv-mobile", "nav", "critical", "قائمة الموبايل مخفية أو مكسورة", "broken mobile menu", "no-mobile-nav", "Under 860px collapse the nav into a full-screen or sheet menu with a real toggle, aria-expanded, focus trap and ESC/backdrop close.", 8),
  r("nv-bread", "nav", "minor", "بلا مسار تنقّل في الصفحات العميقة", "no breadcrumbs", "no-breadcrumb", "Add breadcrumbs (nav aria-label) on any view deeper than one level, with JSON-LD BreadcrumbList.", 3),
  r("nv-search", "nav", "minor", "ماكاينش بحث في موقع فيه محتوى كثير", "no search for content-heavy sites", "no-search", "Add a search field with instant filtering, keyboard shortcut (/ or Ctrl+K), result highlighting and a «no results» state.", 4),

  /* ───────── data / states ───────── */
  r("dt-store", "data", "minor", "البيانات تضيع عند التحديث", "state not persisted", "no-persist", "Persist user data in localStorage/IndexedDB with a versioned key and a migration path; wrap every access in try/catch.", 3),
  r("dt-seed", "data", "minor", "بيانات تجريبية قليلة (3 أسطر)", "thin sample data", "thin-data", "Ship a believable seeded dataset (100+ rows generated from a seeded PRNG) so every view looks real.", 4),
  r("dt-money", "data", "critical", "حسابات الفلوس بالأعشار — أخطاء في المجاميع", "float money maths", "float-money", "Store money as integer cents/dinar, compute with integers, format only at the edge; verify totals against the line items.", 8),
  r("dt-table", "data", "minor", "جداول بلا ترقيم ولا ترتيب", "tables without sort/pagination", "no-table-tools", "Large tables need sticky headers, sortable columns, pagination (or virtualisation above 200 rows) and a row count.", 4),

  /* ───────── media ───────── */
  r("md-broken", "media", "critical", "روابط صور خارجية مختَرَعة — كلها تكسر", "invented or broken media URLs", "broken-media", "Never invent URLs: draw with CSS gradients and inline SVG, or use assets that actually exist; add onerror fallbacks to every <img>.", 9),
  r("md-svg", "media", "minor", "أيقونات صور raster بدل SVG", "raster icons instead of SVG", "raster-icons", "Use inline SVG icons (currentColor, 1.5–2px stroke, 24px grid) so they scale and follow the theme.", 4),
  r("md-audio", "media", "minor", "صوت يشتغل بلا تفاعل من المستخدم", "audio before user gesture", "audio-gesture", "Create the AudioContext and play only after a user gesture; add a visible mute control persisted in localStorage.", 4),
  r("md-ratio", "media", "minor", "فيديو/صور بلا نسبة ثابتة", "media without aspect ratio", "no-aspect", "Wrap media in aspect-ratio containers (16/9, 4/3, 1/1) so the layout never jumps.", 2),

  /* ───────── trust ───────── */
  r("tr-contact", "trust", "minor", "ماكاينش اتصال واضح (بريد/هاتف/عنوان)", "no visible contact info", "no-contact", "Footer must show a real contact channel, the legal name, the country, and links to privacy/terms.", 4),
  r("tr-legal", "trust", "minor", "بلا سياسة خصوصية ولا شروط", "no privacy/terms", "no-legal", "Add privacy policy and terms pages (or a modal) written for the actual jurisdiction and data you collect.", 2),
  r("tr-brand", "trust", "minor", "الهوية غير ثابتة (شعار/اسم/لون يتبدل)", "inconsistent brand", "brand-drift", "One name, one logo mark (SVG), one accent colour and one tone of voice across every screen and message.", 3),
  r("tr-secure", "trust", "polish", "ماكاينش إشارات أمان في صفحة الدفع", "no trust signals at checkout", "no-trust-signals", "At checkout show lock icon, accepted payment marks, guarantee, and support availability.", 2),

  /* ───────── mobile ───────── */
  r("mb-360", "mobile", "critical", "يتكسر في عرض 360px", "breaks at 360px", "breaks-360", "Test and fix 360px: single column, no fixed widths above 100%, tap targets 44px, text ≥14px, tables scroll horizontally.", 9),
  r("mb-thumb", "mobile", "major", "الأزرار المهمة في الأعلى — بعيدة على الإبهام", "primary actions out of thumb reach", "thumb-zone", "On mobile put the primary action in the bottom third (sticky bottom bar), keep destructive actions away from it.", 5),
  r("mb-zoom", "mobile", "minor", "الحقول تعمل زووم إجباري (font-size < 16px)", "inputs trigger iOS zoom", "input-zoom", "Set input/select/textarea font-size:16px on mobile to stop iOS auto-zoom.", 4),
  r("mb-fixed", "mobile", "minor", "عناصر ثابتة تغطي المحتوى", "fixed elements overlap content", "fixed-overlap", "Add padding-bottom to the scrolling content equal to the fixed bar height + safe-area inset.", 3),

  /* ───────── code quality ───────── */
  r("cd-alert", "code", "major", "alert/confirm/prompt في موقع احترافي", "blocking browser dialogs", "uses-alert", "Replace alert/confirm/prompt with in-page toasts and modals that match the design system.", 6),
  r("cd-legacy", "code", "minor", "HTMLقديم: وسوم وسمات تقديمية (bgcolor, font, center, align)", "legacy presentational HTML", "legacy-html", "Delete <font>/<center>/<marquee> and every bgcolor/align/cellpadding attribute; express presentation in CSS classes and tokens instead.", 4),
  r("cd-console", "code", "minor", "console.log باقية في الكود", "left-over console logs", "has-console", "Remove debug logs; keep a single guarded error logger if needed.", 3),
  r("cd-inline", "code", "minor", "تنسيقات inline في كل عنصر", "inline styles everywhere", "inline-styles", "Move repeated inline styles into classes/tokens; keep inline styles only for truly dynamic values.", 3),
  r("cd-dup", "code", "major", "كتل مكرّرة بدل مكوّن واحد", "duplicated blocks", "dup-blocks", "Extract repeated markup into a render function/template and repeated CSS into one class; one source of truth per pattern.", 6),
  r("cd-ids", "code", "critical", "الكود يطلب معرفات غير موجودة — خطأ عند الإقلاع", "getElementById on missing ids", "missing-ids", "Create the missing elements or fix the ids; null-check every lookup and fail visibly, not silently.", 9),
  r("cd-trycatch", "code", "major", "نداءات المتصفح بلا حماية — الصفحة تولّي بيضاء", "unguarded browser APIs", "no-trycatch", "Wrap localStorage, clipboard, audio, fullscreen, geolocation and fetch in try/catch with a real fallback path.", 6),
  r("cd-modules", "code", "minor", "import/export في ملف HTML واحد — ما يشتغلش", "ES modules inside a single HTML file", "es-modules", "For a single-file build use classic scripts and a global namespace object; modules only with a real build step.", 5),
  r("cd-vars", "code", "minor", "أسماء عامة ومتغيرات سحرية", "magic numbers and vague names", "magic-numbers", "Name constants, hoist configuration into one CONFIG object, and avoid single-letter names outside loops.", 3)
];

/** Rules indexed by their analyzer key. */
export const RULE_BY_DETECT: Map<string, DesignRule> = new Map(DESIGN_RULES.filter((x) => x.detect).map((x) => [x.detect as string, x]));

/** Rules indexed by id. */
export const RULE_BY_ID: Map<string, DesignRule> = new Map(DESIGN_RULES.map((x) => [x.id, x]));

export const DESIGN_RULE_COUNT = DESIGN_RULES.length;

export function rulesFor(cat: DesignCat): DesignRule[] {
  return DESIGN_RULES.filter((x) => x.cat === cat);
}

/** The prompt-only law: everything a model must respect when improving a site. */
export function DESIGN_LAW(maxRules = 40): string {
  const byCat = new Map<DesignCat, DesignRule[]>();
  for (const rule of DESIGN_RULES) {
    const list = byCat.get(rule.cat) ?? [];
    list.push(rule);
    byCat.set(rule.cat, list);
  }
  const out: string[] = [];
  for (const [cat, list] of byCat) {
    out.push(`## ${CAT_AR[cat]} (${cat})`);
    for (const rule of list.slice(0, maxRules)) out.push(`- [${rule.sev}] ${rule.en} → ${rule.fix}`);
  }
  return out.join("\n");
}

/** A tight law containing only the rules the audit actually flagged. */
export function lawForFindings(ids: string[]): string {
  const rules = ids.map((id) => RULE_BY_ID.get(id)).filter((x): x is DesignRule => !!x);
  if (!rules.length) return DESIGN_LAW(12);
  return rules
    .slice(0, 46)
    .map((rule, i) => `${i + 1}. [${rule.sev.toUpperCase()} · ${CAT_AR[rule.cat]}] ${rule.ar}\n   FIX: ${rule.fix}`)
    .join("\n");
}

/** Category order used by the UI (worst first is computed at runtime). */
export const CATS: DesignCat[] = [
  "layout",
  "color",
  "type",
  "space",
  "motion",
  "a11y",
  "ux",
  "copy",
  "conv",
  "perf",
  "seo",
  "ar",
  "forms",
  "nav",
  "data",
  "media",
  "trust",
  "mobile",
  "code",
];
