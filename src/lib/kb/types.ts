/**
 * NEXUS ATLAS — قاعدة المعرفة الضخمة (v18)
 * ---------------------------------------------------------------------------
 * Shared, framework-free types + text normalisation used by:
 *   · the built-in knowledge base  (@/lib/kb/data)
 *   · the search / retrieval engine (@/lib/kb/engine)
 *   · the user-uploadable data vault (@/lib/kb/vault)
 *   · the public + chat APIs        (@/app/api/kb/*)
 *
 * Everything here is pure: it runs identically in the browser, in the
 * serverless function and in the Node self-test scripts (no `Buffer`,
 * no `process`, no DOM).
 */

export type KbLang = "ar" | "fr" | "en";

/** Coarse domains — used for filters, icons and the knowledge page. */
export type KbCategory =
  | "algeria"      // الجزائر: ولايات، إدارات، وثائق، اقتصاد
  | "education"    // الدراسة: باك، بيام، معدلات، تخصصات، منح
  | "business"     // التجارة: ANSEJ، AUTO-ENTREPRENEUR، ضرائب، استيراد/تصدير
  | "legal"        // القانون والحقوق
  | "health"       // الصحة والتغذية
  | "tech"         // البرمجة، الذكاء الاصطناعي، الشبكات، الأمن
  | "ai"           // نماذج الذكاء الاصطناعي وأدواته
  | "media"        // تصميم، تصوير، مونتاج، صوت
  | "language"     // لغات، دارجة، ترجمة، كتابة
  | "travel"       // سفر، نقل، تأشيرات
  | "money"        // أموال، بنوك، دفع إلكتروني، عملات
  | "work"         // عمل، سيرة ذاتية، مقابلات، عمل حر
  | "life"         // حياة يومية، عائلة، رياضة
  | "science"      // علوم ورياضيات وفيزياء
  | "islam"        // دين ومواقيت وأحكام عامة
  | "nexus";       // عن التطبيق نفسه: ميزاته وإعداداته

export type KbFact = {
  /** human-readable label */
  k: string;
  /** value (string or number) */
  v: string | number;
  /** optional unit */
  u?: string;
};

export type KbEntry = {
  /** stable id, kebab-case, unique */
  id: string;
  category: KbCategory;
  /** title in the three UI languages (at least `ar`) */
  title: Partial<Record<KbLang, string>> & { ar: string };
  /** one-line answer shown in search results (derived from the body when omitted) */
  summary?: Partial<Record<KbLang, string>>;
  /** the full body — markdown allowed */
  body: string;
  /** search keywords in every language/dialect the user may type */
  tags: string[];
  /** structured numbers that can be quoted exactly */
  facts?: KbFact[];
  /** where the information comes from (name + optional url) */
  source?: { name: string; url?: string };
  /** how trustworthy / how often it changes: 1 = volatile, 5 = stable */
  reliability?: 1 | 2 | 3 | 4 | 5;
  /** ISO date of the last human verification */
  updated?: string;
  /** 0-100 — how often this entry is useful (drives ranking boost) */
  weight?: number;
};

/** A search hit with an explainable score (0..1). */
export type KbHit = {
  entry: KbEntry;
  score: number;
  /** why it matched — shown in the UI and given to the model */
  matched: string[];
  /** the most relevant snippet of the body, with the query highlighted */
  snippet: string;
};

export type KbStats = {
  entries: number;
  categories: number;
  tags: number;
  words: number;
  bytes: number;
  /** per-category counters */
  byCategory: Record<string, number>;
  languages: Record<KbLang, number>;
};

/* ═══════════════════════════════════════════════════════════════════
 *  Arabic-first text normalisation
 *  The user types "باك" or "BAC" or "bac 2026" or "الباك" — all of it
 *  has to land on the same entry.
 * ═══════════════════════════════════════════════════════════════════ */

const TATWEEL = /[\u0640]/g;
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ALEF = /[\u0622\u0623\u0625\u0627\u0671]/g;
const YEH = /[\u0649\u0626\u06A0]/g;
const TEH = /\u0629/g;
const HEH_YEH = /\u06C1/g;
const NON_WORD = /[^\p{L}\p{N}]+/gu;

/** Arabic definite prefixes that carry no meaning for search. */
const AR_STOP = new Set([
  "في", "من", "الى", "إلى", "علي", "على", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
  "الذى", "هل", "ما", "ماذا", "كيف", "متي", "متى", "اين", "أين", "كم", "لو", "او", "أو",
  "و", "ف", "ثم", "لكن", "بل", "ان", "أن", "إن", "كي", "قد", "لقد", "بين", "عند", "كل",
  "بعض", "غير", "حتى", "بعد", "قبل", "تحت", "فوق", "يا", "اي", "أي", "هي", "هو", "هم",
  "the", "a", "an", "of", "in", "on", "at", "to", "for", "and", "or", "is", "are", "be",
  "what", "how", "why", "when", "where", "which", "le", "la", "les", "des", "une", "un",
  "de", "du", "et", "ou", "est", "dans", "pour", "sur", "avec", "qui", "que", "comment",
]);

/** Strip diacritics, unify letters, drop punctuation, lowercase. */
export function normalizeText(s: string): string {
  return (s || "")
    .replace(TATWEEL, "")
    .replace(DIACRITICS, "")
    .replace(ALEF, "ا")
    .replace(YEH, "ي")
    .replace(TEH, "ه")
    .replace(HEH_YEH, "ه")
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
    .toLowerCase()
    .replace(NON_WORD, " ")
    .trim();
}

/** Tokenize into searchable terms (stopwords removed, length ≥ 2). */
export function tokenize(s: string): string[] {
  const out = normalizeText(s).split(" ").filter(Boolean);
  const kept: string[] = [];
  for (const t of out) {
    if (t.length < 2) continue;
    if (AR_STOP.has(t)) continue;
    kept.push(t);
    // light Arabic stemming: strip a leading "و"/"ف"/"ب"/"ل"/"ال" and common suffixes
    const st = stem(t);
    if (st.length >= 3 && st !== t) kept.push(st);
  }
  return kept;
}

/** Very light, deterministic stemmer — enough for recall, cheap at runtime. */
export function stem(t: string): string {
  let s = t;
  if (s.startsWith("ال") && s.length > 4) s = s.slice(2);
  else if (/^[وفبكل]/.test(s) && s.length > 3) s = s.slice(1);
  if (/(ات|ون|ين|ان|ها|هم|هن|كم|كن|نا|ية|يه)$/.test(s) && s.length > 4) s = s.slice(0, -2);
  else if (/(ات|ون|ين|ان|ها|هم|ية)$/.test(s) && s.length > 5) s = s.slice(0, -2);
  return s;
}

/** Unique, order-preserving token list. */
export function uniq(a: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of a) if (!seen.has(x)) (seen.add(x), out.push(x));
  return out;
}

/** Levenshtein distance capped early — used for typo tolerance. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Fuzzy containment: exact substring > word prefix > small edit distance. */
export function fuzzyMatch(needle: string, hay: string): number {
  if (!needle) return 0;
  if (hay.includes(needle)) return 1;
  const words = hay.split(" ");
  for (const w of words) {
    if (w === needle) return 1;
    if (w.startsWith(needle) && needle.length >= 3) return 0.82;
    if (needle.startsWith(w) && w.length >= 3) return 0.7;
    if (needle.length >= 4 && w.length >= 4) {
      const d = editDistance(needle, w, 2);
      if (d <= 1) return 0.72;
      if (d <= 2) return 0.5;
    }
  }
  return 0;
}

/**
 * Splits a long text into overlapping chunks on line/sentence boundaries.
 * Used by the data vault so retrieval never cuts a sentence in half.
 */
export function chunkLines(text: string, size = 1600, overlap = 200): string[] {
  const clean = (text || "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      // prefer a paragraph, then a sentence, then a space
      const window = clean.slice(start, end);
      const para = window.lastIndexOf("\n\n");
      const line = window.lastIndexOf("\n");
      const dot = Math.max(window.lastIndexOf(". "), window.lastIndexOf("؟ "), window.lastIndexOf("! "));
      const space = window.lastIndexOf(" ");
      const cut = para > size * 0.4 ? para : line > size * 0.4 ? line : dot > size * 0.4 ? dot + 1 : space > size * 0.3 ? space : -1;
      if (cut > 0) end = start + cut;
    }
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + Math.floor(size * 0.5));
  }
  return out.filter(Boolean);
}

/** `<<mark>>` a snippet around the first strong match (UI highlighting). */
export function makeSnippet(body: string, terms: string[], radius = 110): string {
  const n = normalizeText(body);
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
    const j = n.indexOf(t);
    if (j >= 0 && (at < 0)) at = j;
  }
  const clean = body.replace(/\s+/g, " ").trim();
  if (at < 0) return clean.slice(0, radius * 2);
  const start = Math.max(0, Math.min(at - radius, clean.length - radius));
  const end = Math.min(clean.length, start + radius * 2);
  return (start > 0 ? "…" : "") + clean.slice(start, end) + (end < clean.length ? "…" : "");
}
