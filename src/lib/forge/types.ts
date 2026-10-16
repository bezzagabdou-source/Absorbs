/**
 * NEXUS FORGE v19 — الأنواع المشتركة (types + wire protocol)
 * ---------------------------------------------------------------------------
 * The Forge is the multi-model build engine: one architect plans a project, a
 * pool of "legendary" models writes its modules IN PARALLEL, an assembler turns
 * them into one self-contained file (plus a real multi-file tree), a QA pass
 * verifies and repairs it, and the publisher gives it a permanent live link.
 *
 * Client-safe: types, constants and pure helpers only (no `process`, no DB).
 */

export type ForgeKind = "game" | "site" | "system" | "app" | "tool" | "landing";

export const FORGE_KINDS: { id: ForgeKind; ar: string; emoji: string }[] = [
  { id: "game", ar: "لعبة", emoji: "🎮" },
  { id: "site", ar: "موقع", emoji: "🌐" },
  { id: "system", ar: "نظام + قاعدة بيانات", emoji: "🗄️" },
  { id: "app", ar: "تطبيق ويب", emoji: "📱" },
  { id: "tool", ar: "أداة", emoji: "🛠️" },
  { id: "landing", ar: "صفحة هبوط", emoji: "🚀" },
];

export type ModuleKind = "html" | "css" | "js" | "json" | "md";

/** What an engine does inside one build. */
export type ForgeRole = "architect" | "builder" | "reviewer" | "repair" | "designer";

export type ForgeModule = {
  /** stable id used in `needs` */
  id: string;
  /** path inside the project tree */
  path: string;
  kind: ModuleKind;
  /** one-line human title (Arabic ok) */
  title: string;
  /** the detailed spec the builder must satisfy */
  spec: string;
  /** target size in LINES — the forge holds every model to it */
  lines: number;
  /** ids of modules whose full code this module receives */
  needs: string[];
  /** computed: build order (0 = no dependency) */
  wave: number;
};

export type ForgeDesign = {
  /** named colours the whole project must use */
  palette: { bg: string; surface: string; text: string; muted: string; accent: string; accent2: string };
  typography: string;
  motion: string;
  layout: string;
  /** extra art direction (Arabic/RTL, cultural context, references) */
  notes: string;
};

export type ForgePlan = {
  title: string;
  kind: ForgeKind;
  language: "ar" | "fr" | "en";
  summary: string;
  design: ForgeDesign;
  /** shared names / state keys / storage keys every module must obey */
  contract: string;
  target: { lines: number; modules: number; kb: number };
  modules: ForgeModule[];
  /** what index.html must contain (sections, in order) */
  shell: string;
};

/** The plan as sent to the browser (no specs — they are big and server-side only). */
export type ForgePlanDto = {
  title: string;
  kind: ForgeKind;
  language: "ar" | "fr" | "en";
  summary: string;
  design: ForgeDesign;
  target: ForgePlan["target"];
  contract: string;
  shell: string;
  modules: { id: string; path: string; kind: ModuleKind; title: string; lines: number; wave: number; needs: string[]; spec?: string }[];
};

export type ForgeFile = {
  path: string;
  kind: ModuleKind;
  title: string;
  wave: number;
  code: string;
  bytes: number;
  lines: number;
  /** which model actually wrote it */
  model: string;
  ms: number;
  retries: number;
  /** 0..1 — how close to the target size, penalised for placeholders */
  quality: number;
};

/** One engine that took part in the build. */
export type ModelRef = { key: string; label: string; role: ForgeRole; module?: string; ms?: number };

export type ForgeIssue = { level: "error" | "warn"; where: string; text: string };

export type ForgeQa = {
  score: number;
  issues: ForgeIssue[];
  repaired: number;
  checks: { name: string; ok: boolean; detail?: string }[];
};

export type ForgeStats = {
  ms: number;
  lines: number;
  bytes: number;
  files: number;
  models: { model: string; files: number; lines: number }[];
  calls: number;
  retries: number;
  repairs: number;
};

/** Everything the finished build reports. */
export type ForgeMeta = {
  scale: ForgeScale;
  kind: ForgeKind;
  language: "ar" | "fr" | "en";
  modules: number;
  lines: number;
  bytes: number;
  singleLines: number;
  singleBytes: number;
  models: ModelRef[];
  ms: number;
  qa: ForgeQa;
  stats: ForgeStats;
};

/** What the client posts to /api/ai/forge. */
export type ForgeRequest = {
  prompt: string;
  kind?: ForgeKind;
  scale?: ForgeScale;
  /** extra hard requirements (Arabic ok) */
  extra?: string;
  /** let the Forge fetch real images/sounds from the open web */
  internet?: boolean;
  /** publish a live link at the end */
  publish?: boolean;
  userId?: string;
};

/* ------------------------------------------------------------------ *
 * NDJSON progress protocol — the UI paints every stage live
 * ------------------------------------------------------------------ */
export type ForgeStage = "architect" | "contract" | "build" | "assemble" | "qa" | "repair" | "publish" | "done";

export const STAGE_LABEL: Record<ForgeStage, string> = {
  architect: "المهندس المعماري يخطّط المشروع",
  contract: "كتابة العقد الموحّد (أسماء، حالات، تصميم)",
  build: "النماذج الأسطورية تكتب الوحدات بالتوازي",
  assemble: "تجميع الملفات في مشروع واحد",
  qa: "الفحص الآلي (أخطاء، نقص، روابط)",
  repair: "إصلاح ما وجده الفحص",
  publish: "نشر الرابط الحي",
  done: "اكتمل البناء",
};

export type ForgeEvent =
  | { t: "start"; scale: ForgeScale; kind: ForgeKind; language: string; target: number; engines: number; plan: "free" | "pro" }
  | { t: "stage"; stage: ForgeStage; label: string; pct: number; state: "working" | "done"; model?: string; path?: string }
  | { t: "log"; text: string }
  | { t: "net"; images: number; audio: number; source: string }
  | { t: "plan"; plan: ForgePlanDto; ms: number }
  | { t: "wave"; wave: number; total: number; modules: string[] }
  | { t: "model"; model: string; key: string; role: ForgeRole; state: "start" | "done" | "retry" | "fail"; path?: string; note?: string; lines?: number; ms?: number }
  | { t: "file"; path: string; kind: ModuleKind; lines: number; kb: number; state: "ok" | "issues" | "repaired" | "merged" | "fallback"; model?: string; note?: string; code?: string }
  | { t: "qa"; qa: ForgeQa }
  | { t: "html"; html: string; lines: number; bytes: number; scripts: number; styles: number }
  | { t: "tree"; files: { path: string; data: string }[] }
  | { t: "live"; url: string; slug: string; kind: "db" | "portable" }
  | { t: "stats"; meta: ForgeMeta }
  | { t: "done"; ok: true; title: string; lines: number; files: number }
  | { t: "error"; code: string; detail?: string };

/* ------------------------------------------------------------------ *
 * sizes
 * ------------------------------------------------------------------ */
/** How big a build the user asked for — drives module count and per-module lines. */
export type ForgeScale = "standard" | "big" | "titan";

export const SCALE_META: Record<ForgeScale, { ar: string; modules: [number, number]; lines: [number, number]; total: number }> = {
  standard: { ar: "عادي · ~2 500 سطر", modules: [5, 8], lines: [180, 420], total: 2_500 },
  big: { ar: "ضخم · ~6 000 سطر", modules: [8, 14], lines: [320, 700], total: 6_000 },
  titan: { ar: "تيتان · 10 000+ سطر", modules: [12, 22], lines: [420, 1_100], total: 12_000 },
};

export const SCALES: ForgeScale[] = ["standard", "big", "titan"];

export const FORGE_MAX_MODULES = 26;
export const FORGE_MAX_FILE_LINES = 1_600;
export const FORGE_MAX_TOTAL_LINES = 40_000;
/** Biggest single file the publisher accepts (bytes). */
export const FORGE_MAX_HTML_BYTES = 6_000_000;

/** Placeholder / laziness markers that mean "the model did not finish the job". */
export const LAZY_MARKERS = [
  "todo:",
  "fixme",
  "rest of the code",
  "remaining code",
  "same as before",
  "as above",
  "etc.",
  "...",
  "/* ... */",
  "// ...",
  "placeholder",
  "lorem ipsum",
  "coming soon",
  "not implemented",
  "left as an exercise",
  "add more here",
  "الباقي",
  "الى اخره",
  "إلى آخره",
  "هنا تضع",
  "مكان مخصص",
];

export function countLines(s: string): number {
  return s ? s.split("\n").length : 0;
}

export function byteLength(s: string): number {
  return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : s.length;
}

export function kb(n: number): string {
  return (n / 1024).toFixed(n >= 1024 * 1024 ? 1 : 0);
}

/** Cheap "did the model actually write the file" scan. */
export function lazyHits(code: string): string[] {
  const low = code.toLowerCase();
  return LAZY_MARKERS.filter((m) => low.includes(m));
}

/** 0..1 quality of one written module (size vs target, minus laziness). */
export function qualityOf(code: string, targetLines: number): number {
  const lines = countLines(code);
  const size = Math.min(1, lines / Math.max(1, targetLines));
  const lazy = lazyHits(code).length;
  return Math.max(0, Math.min(1, size - lazy * 0.08));
}
