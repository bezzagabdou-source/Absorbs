/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEXUS MIND v17 — قوة الفهم المطلقة
 * ═══════════════════════════════════════════════════════════════════════════
 *  A deterministic reading layer that sits IN FRONT of every model call.
 *
 *  Why it exists: the models are strong, but they are handed raw text. A real
 *  request from an Algerian user is usually Darija + French + Arabizi
 *  ("salam, bghit n3mel jeu b html"), full of typos, with the real constraints
 *  buried in the middle (budget, city, deadline, level, quantity).
 *
 *  MIND reads the request the way a human project manager would — BEFORE a
 *  single token is spent on a model:
 *    1. protect what must never be rewritten (code fences, inline code, URLs,
 *       emails, maths), then normalise the rest: diacritics, Alef/Ya/Ta-Marbuta
 *       forms, Arabic-Indic digits, Arabizi, French SMS, one-edit typos
 *    2. detect the language mix and the script (including Darija in Latin letters)
 *    3. score 20+ intents with weighted patterns (never first-match-wins)
 *    4. extract entities: money, dates, times, phones, wilayas, school levels,
 *       quantities, target languages, stacks, URLs, emails, named subjects
 *    5. read mood, urgency, complexity and the expected deliverable shape
 *    6. notice what is MISSING and turn it into one clarifying chip + one
 *       explicit assumption the model must state in a single line
 *    7. emit a compact UNDERSTANDING BRIEF injected into the system prompt, so
 *       the answer is aimed instead of guessed
 *
 *  Pure TypeScript, zero dependencies, zero network, isomorphic: the exact same
 *  code explains a request in the UI (client) and steers the model (server), so
 *  what the user sees is what the model was told. Sub-millisecond.
 */

/* ────────────────────────────── types ────────────────────────────── */

export type MindIntent =
  | "greet"
  | "smalltalk"
  | "question"
  | "build_game"
  | "build_site"
  | "build_app"
  | "build_ui"
  | "code_write"
  | "code_fix"
  | "code_explain"
  | "translate"
  | "summarize"
  | "write_content"
  | "study"
  | "math"
  | "business"
  | "marketing"
  | "image"
  | "video"
  | "music"
  | "analyse"
  | "complaint"
  | "emotional"
  | "chat";

export type MindLanguage = "ar" | "ar-dz" | "fr" | "en" | "mixed";
export type Sentiment = "positive" | "neutral" | "negative";
export type Urgency = "low" | "normal" | "high";
export type Complexity = "simple" | "medium" | "complex";
export type DeliverableFormat =
  | "text" | "markdown" | "code" | "html" | "table" | "list" | "steps" | "json";

export interface MindEntities {
  money: { amount: number; currency: string; raw: string }[];
  dates: string[];
  times: string[];
  urls: string[];
  emails: string[];
  phones: string[];
  places: string[];
  levels: string[];
  quantities: { value: number; unit: string }[];
  languages: string[];
  codeLangs: string[];
  numbers: number[];
  quoted: string[];
  people: string[];
}

export interface MindReading {
  raw: string;
  /** after cleanup: unified letters, digits, punctuation, spacing */
  clean: string;
  /** clean + Arabizi / SMS / typo expansion — what MIND actually understood */
  normalized: string;
  language: MindLanguage;
  languageMix: { arabic: number; latin: number };
  script: "arabic" | "latin" | "mixed";
  /** Darija written with Latin letters / digits ("bghit n3mel jeu") */
  arabizi: boolean;
  intent: MindIntent;
  intentLabel: string;
  altIntent: MindIntent | null;
  altIntentLabel: string | null;
  /** 0-100 */
  confidence: number;
  domain: string;
  entities: MindEntities;
  sentiment: { score: number; label: Sentiment };
  urgency: Urgency;
  complexity: Complexity;
  deliverable: {
    format: DeliverableFormat;
    length: "short" | "medium" | "long";
    language: "ar" | "fr" | "en" | "match";
  };
  audience: string | null;
  /** things the request did not say — each becomes a one-tap chip + an assumption */
  missing: { key: string; question: string; guess: string }[];
  keywords: string[];
  words: number;
  /** Arabic trace shown in the 🧠 card */
  explain: string[];
  /** the block appended to the system prompt */
  brief: string;
  /** what MIND had to repair, so the user can veto it */
  corrections: string[];
  /** spans MIND refused to touch (code, links, maths) */
  protectedSpans: number;
  ms: number;
}

/* ─────────────────────────── normalisation ─────────────────────────── */

const TASHKEEL = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const AR_DIGITS = /[٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹]/g;
const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};
/** Letter unification — used for MATCHING and typo repair, never shown as a rewrite. */
const UNIFY: [RegExp, string][] = [
  [/[أإآٱ]/g, "ا"],
  [/ى/g, "ي"],
  [/ؤ/g, "و"],
  [/ئ/g, "ي"],
  [/ة/g, "ه"],
  [/گ/g, "ك"],
  [/پ/g, "ب"],
  [/چ/g, "ج"],
  [/ژ/g, "ز"],
  [/ی/g, "ي"],
  [/ک/g, "ك"],
  [/ـ/g, ""],
];

function unifyLetters(s: string): string {
  let out = s;
  for (const [re, to] of UNIFY) out = out.replace(re, to);
  return out;
}

/**
 * Spans that must survive byte-for-byte: fenced code, inline code, URLs, emails,
 * Windows/Unix paths and maths expressions. Without this guard an Arabizi pass
 * turns `f(x)=3x^2` into `f(x)=عx^2` and destroys the user's own code.
 */
const PROTECTED =
  /```[\s\S]*?(?:```|$)|`[^`\n]+`|https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+|(?:[\w~-]+\/){2,}[\w~.-]+|\b\d+(?:[.,]\d+)*\s*[-+*/^=<>]\s*\d+(?:[.,]\d+)*\b|[A-Za-z_]\w*\([^)\n]{0,40}\)\s*=/g;

/**
 * Arabizi (the Arabic chat alphabet), Maghrebi reading. Longest keys first so
 * "3a" wins over "3".
 */
const ARABIZI_PAIRS: [string, string][] = [
  ["3a", "غ"], ["3'", "غ"], ["3h", "غ"],
  ["7'", "خ"], ["7h", "خ"],
  ["6'", "ظ"], ["9'", "ض"],
  ["2a", "أ"], ["2'", "ء"],
  ["5", "خ"], ["7", "ح"], ["8", "غ"], ["9", "ص"], ["6", "ط"], ["3", "ع"], ["2", "ء"],
];
/** tokens that only look like Arabizi: versions, CSS units, HTML tags, file names */
const NOT_ARABIZI =
  /^(?:v|p|h|q|k|w|mp3|mp4|3d|2d|4k|8k|1080|1920|f|d|s|md|px|em|rem|vh|vw|deg)\d/i;

/**
 * Darija / Maghrebi + French SMS + English chat shortcuts, whole-word only.
 * Keys are Latin chat spellings; values are the meaning MIND matches on.
 */
const LEXICON: Record<string, string> = {
  // ── Algerian / Moroccan Darija
  salam: "سلام", slm: "سلام", sba7: "صباح", sbah: "صباح",
  wesh: "هل", wach: "هل", wash: "هل", ach: "ماذا", chno: "ماذا", chnouwa: "ماذا",
  kifach: "كيف", kifa: "كيف", kich: "كيف", kifah: "كيف",
  "3lach": "لماذا", "3lah": "لماذا", "3la": "على", ala: "على",
  bghit: "أريد", bghina: "نريد", bgha: "يريد", nhb: "أحب", ridt: "أريد", hab: "أراد",
  "3endek": "عندك", "3endi": "عندي", ma3endich: "لا أملك", "3labalek": "هل تعلم",
  "3labalak": "هل تعلم",
  bezaf: "كثيرا", bezzaf: "كثيرا", bezzef: "كثيرا", chwiya: "قليلا", chwia: "قليلا",
  daba: "الآن", drk: "الآن", dorka: "الآن", tawa: "الآن", lyoum: "اليوم", lyom: "اليوم",
  ghedwa: "غدا", ghda: "غدا", lbare7: "البارحة", lbarah: "البارحة",
  kayn: "يوجد", makach: "لا يوجد", machi: "ليس",
  mlih: "جيد", mezyen: "جيد", behi: "جيد", wa3er: "رائع", khrafi: "خرافي",
  sahha: "شكرا", shukran: "شكرا", baraka: "شكرا",
  hadi: "هذه", hada: "هذا", hadou: "هؤلاء", dak: "ذلك",
  flous: "نقود", drahem: "نقود", khdam: "يعمل", khedma: "عمل",
  drari: "شباب", sahbi: "صديقي", khoya: "أخي", weld: "ابن", bent: "بنت", dar: "بيت",
  m3a: "مع", maa: "مع",
  nemchi: "سأذهب", ghadi: "سأذهب", nji: "آتي", yji: "يأتي",
  n3mel: "أصنع", n3ml: "أصنع", ndir: "أصنع", dirli: "اصنع لي", a3mel: "اصنع", asna: "اصنع",
  saueb: "اصنع", saoueb: "اصنع",
  "3awd": "أيضا", zid: "زد", nqos: "أنقص",
  fahmni: "افهمني", chrah: "اشرح", chrahli: "اشرح لي",
  kteb: "اكتب", ktbli: "اكتب لي", ktebli: "اكتب لي", jaweb: "أجب",
  haka: "هكذا", hakda: "هكذا", bhal: "مثل", bhalha: "مثلها",
  sghir: "صغير", kbir: "كبير",
  inchallah: "إن شاء الله", inshallah: "إن شاء الله", hamdoulilah: "الحمد لله",
  yar7em: "يرحم", y3tik: "يعطيك",
  ghir: "فقط", gha: "فقط", brasha: "كثيرا",
  // ── French SMS
  stp: "s'il te plaît", svp: "s'il vous plaît", pk: "pourquoi", pq: "pourquoi",
  cmt: "comment", cb: "combien", bcp: "beaucoup", tjs: "toujours", qqn: "quelqu'un",
  dc: "donc", mdr: "ضحك كثيرا", rdv: "rendez-vous",
  jsp: "je ne sais pas", jpp: "je ne peux pas", dsl: "désolé", slt: "salut",
  cv: "comment ça va", prq: "parce que", tkt: "ne t'inquiète pas",
  // ── English chat
  pls: "please", plz: "please", thx: "thanks", ty: "thank you", ur: "your",
  b4: "before", asap: "urgent", idk: "I do not know",
  btw: "by the way", imo: "in my opinion",
  gonna: "going to", wanna: "want to", kinda: "kind of",
};

/**
 * Domain lexicon for one-edit typo repair. Only 4+ character words are touched,
 * and only when exactly ONE dictionary word is within one edit — an ambiguous
 * neighbour is left alone, because a silent wrong guess is worse than a typo.
 */
const SPELL: string[] = [
  // Arabic — content words
  "لعبة", "الالعاب", "موقع", "تطبيق", "تطبيقات", "تصميم", "مصمم", "ترجمة", "تلخيص",
  "مقال", "مقالات", "بحث", "دراسة", "امتحان", "فرض", "اختبار", "تمرين", "تمارين",
  "مدرسة", "جامعة", "ثانوي", "متوسط", "ابتدائي", "رياضيات", "فيزياء", "تاريخ",
  "جغرافيا", "فلسفة", "انجليزية", "فرنسية", "عربية", "معلومات", "برنامج", "برمجة",
  "كود", "خطأ", "اخطاء", "اصلاح", "تحسين", "تطوير", "صورة", "صور", "فيديو",
  "موسيقى", "قصة", "قصص", "شعر", "اعلان", "منتج", "منتجات", "سعر", "اسعار",
  "زبون", "زبائن", "متجر", "بيع", "شراء", "توصيل", "مذكرة", "تخرج", "سيرة",
  "ذاتية", "رسالة", "بريد", "الكتروني", "محتوى", "منشور", "صفحة", "فيسبوك",
  "انستغرام", "يوتيوب", "مقدمة", "خاتمة", "فهرس", "مراجع", "تحليل", "تقرير", "عرض",
  "مستوى", "مراحل", "مرحلة", "صعوبة", "الوان", "شاشة", "هاتف", "حاسوب",
  // Arabic — function words people mistype most
  "هذا", "هذه", "ذلك", "تلك", "لكن", "لان", "ايضا", "شيء", "اشياء", "هنا",
  "هناك", "حين", "بين", "عند", "عندما", "الذي", "التي", "كيف", "ماذا", "لماذا",
  "متى", "اين", "هل", "او", "ثم", "كل", "بعض", "حتى", "مع", "من", "الى", "على",
  // places
  "الجزائر", "وهران", "قسنطينة", "عنابة", "سطيف", "باتنة", "بجاية", "ورقلة", "بشار",
  // French
  "jeu", "jeux", "site", "application", "design", "traduction", "resume", "article",
  "recherche", "etude", "examen", "exercice", "ecole", "universite", "maths",
  "physique", "histoire", "programme", "code", "erreur", "image", "video",
  "musique", "produit", "prix", "client", "magasin", "vente", "livraison",
  "algerie", "oran", "contenu", "publication", "page", "analyse", "rapport",
  // English
  "game", "design", "translation", "summary", "research", "study", "exam",
  "school", "university", "program", "error", "video", "music", "product",
  "price", "client", "store", "content", "analysis", "report", "website",
  "mobile", "python", "javascript", "database",
];
const SPELL_SET = new Set(SPELL.map((w) => unifyLetters(w.toLowerCase())));

/* ─────────────────────────── helpers ─────────────────────────── */

const AR_LETTER = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LATIN_LETTER = /[A-Za-zÀ-ÿ]/;

function collapse(s: string): string {
  return s
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function levenshtein(a: string, b: string, max = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** Nearest dictionary word within one edit; null when unknown or ambiguous. */
function typoFix(word: string): string | null {
  const w = unifyLetters(word.toLowerCase());
  if (w.length < 4 || SPELL_SET.has(w)) return null;
  let best: string | null = null;
  for (const cand of SPELL_SET) {
    if (Math.abs(cand.length - w.length) > 1) continue;
    if (levenshtein(w, cand, 1) !== 1) continue;
    if (best && best !== cand) return null;
    best = cand;
  }
  return best;
}

/** Expand Arabizi digits inside a Latin word ("n3mel" → "نعmel") when it is safe. */
function arabiziWord(word: string): string | null {
  if (word.length < 3 || word.length > 16) return null;
  if (!/[2356789]/.test(word)) return null;
  if (!/[A-Za-z]/.test(word)) return null;
  if (NOT_ARABIZI.test(word)) return null;
  // a token with punctuation/operators is code or a path, not chat spelling
  if (/[^\w'-]/.test(word)) return null;
  let out = word.toLowerCase();
  for (const [k, v] of ARABIZI_PAIRS) if (out.includes(k)) out = out.split(k).join(v);
  return /[ءعختحغصظضأ]/.test(out) ? out : null;
}

/**
 * Rewrite one word, keeping its surrounding punctuation intact.
 * `core` is the alphanumeric part; `lead`/`tail` are punctuation.
 */
function fixWord(lead: string, core: string, tail: string, fixes: string[]): string {
  if (!core) return `${lead}${core}${tail}`;
  const lower = core.toLowerCase();
  if (LEXICON[lower]) {
    if (fixes.length < 4) fixes.push(`«${core}» ← ${LEXICON[lower]}`);
    return `${lead}${LEXICON[lower]}${tail}`;
  }
  if (LATIN_LETTER.test(core) && /\d/.test(core)) {
    const az = arabiziWord(core);
    if (az) {
      if (fixes.length < 4) fixes.push(`«${core}» ← ${az} (عربيزي)`);
      return `${lead}${az}${tail}`;
    }
  }
  if (AR_LETTER.test(core) && core.length >= 4) {
    const t = typoFix(core);
    if (t) {
      if (fixes.length < 4) fixes.push(`«${core}» ← ${t}`);
      return `${lead}${t}${tail}`;
    }
  }
  return `${lead}${core}${tail}`;
}

const TOKEN_RE = /^([^\p{L}\p{N}]*)([\p{L}\p{N}'_-]*)([\s\S]*)$/u;

interface NormalizeResult {
  clean: string;
  normalized: string;
  corrections: string[];
  protectedSpans: number;
  arabizi: boolean;
}

function normalizeText(input: string): NormalizeResult {
  const corrections: string[] = [];
  let clean = collapse(input ?? "");
  clean = clean.replace(AR_DIGITS, (d) => DIGIT_MAP[d] ?? d);
  clean = clean.replace(TASHKEEL, "");
  clean = clean.replace(/،/g, ",").replace(/؛/g, ";").replace(/؟/g, "?");
  clean = clean.replace(/[«»]/g, '"');
  // "مررررررحة" → keep two letters (matching also runs on a fully squashed copy)
  clean = clean.replace(/(.)\1{3,}/g, "$1$1");

  // 1) mask protected spans so no rule below can corrupt code, links or maths
  const safe: string[] = [];
  const masked = clean.replace(PROTECTED, (m) => {
    safe.push(m);
    return `\u0001${safe.length - 1}\u0001`;
  });

  // 2) word-level repair on the masked text
  const words = masked.split(/(\s+)/);
  let arabizi = false;
  const out = words.map((w) => {
    if (!w.trim() || /\u0001\d+\u0001/.test(w)) return w;
    const m = TOKEN_RE.exec(w);
    if (!m) return w;
    const [, lead, core, tail] = m;
    if (!core) return w;
    const hadArabicBefore = AR_LETTER.test(core);
    const fixed = fixWord(lead, core, tail, corrections);
    if (!hadArabicBefore && AR_LETTER.test(fixed)) arabizi = true;
    return fixed;
  });
  let normalized = out.join("");

  // 3) restore the protected spans untouched
  normalized = normalized.replace(/\u0001(\d+)\u0001/g, (_m, i: string) => safe[Number(i)] ?? "");

  return {
    clean,
    normalized: normalized.trim(),
    corrections,
    protectedSpans: safe.length,
    arabizi,
  };
}

/* ─────────────────────────── language ─────────────────────────── */

const FR_WORDS =
  /\b(je|tu|il|elle|nous|vous|ils|elles|le|la|les|un|une|des|du|de|et|ou|mais|donc|car|pour|avec|sans|sur|sous|dans|chez|que|qui|quoi|comment|pourquoi|combien|quand|c'est|veux|faire|besoin|site|jeu|créer|créé|écris|écrivez|traduire|résumé|résume|analyse|s'il|s'il|texte|page|produit|prix|client)\b/i;
const EN_WORDS =
  /\b(i|you|he|she|we|they|the|a|an|and|or|but|so|for|with|without|on|in|at|of|to|from|is|are|was|were|be|been|do|does|did|have|has|had|want|need|make|build|write|create|game|site|how|what|when|where|why|please|thanks|text|page|product|price|client)\b/i;

/** Darija in Arabic script. */
const DZ_MARKERS_AR =
  /(بغيت|بغى|واش|واخا|علاه|علاش|بزاف|شوية|دابا|دروك|هادي|مزيان|خويا|صاحبي|ديرلي|صاوب|ندير|نشري|نبيع|فلوس|دراهم|قداش|شنوة|كيفاش|عندي|عندك|ماشي|كاين|مكاينش|هاكا|غير|برشا|ياسر|نعرف|تعرف|نحب|نشوف)/;
/** The same Darija, written in Latin letters / Arabizi. */
const DZ_MARKERS_LA =
  /\b(bghit|bgha|wach|wesh|kifach|kifa|3lach|3lah|bezaf|bezzaf|chwiya|daba|dorka|hadi|hadou|mlih|mezyen|khoya|sahbi|dirli|saueb|ndir|n3mel|nchri|nbi3|flous|drahem|qdach|chnouwa|3endi|3endek|machi|kayn|makach|ghir|brasha|ya3ni|nhab|nchouf|wesh|za3ma)\b/i;

function detectLanguage(text: string, normalized: string, arabizi: boolean) {
  let ar = 0;
  let la = 0;
  for (const ch of text) {
    if (AR_LETTER.test(ch)) ar++;
    else if (LATIN_LETTER.test(ch)) la++;
  }
  const total = Math.max(1, ar + la);
  const mix = { arabic: Math.round((ar / total) * 100), latin: Math.round((la / total) * 100) };
  const script: "arabic" | "latin" | "mixed" =
    mix.arabic >= 85 ? "arabic" : mix.latin >= 85 ? "latin" : "mixed";

  const frHits = (text.match(new RegExp(FR_WORDS.source, "gi")) ?? []).length;
  const enHits = (text.match(new RegExp(EN_WORDS.source, "gi")) ?? []).length;
  const dz = DZ_MARKERS_AR.test(text) || DZ_MARKERS_LA.test(text) || DZ_MARKERS_LA.test(normalized);

  let language: MindLanguage;
  if (dz) language = "ar-dz";
  else if (script === "arabic") language = "ar";
  else if (script === "latin") language = frHits > enHits ? "fr" : "en";
  else language = "mixed";

  // Darija written with Latin letters expands into Arabic → still Darija, mixed script
  if (arabizi && language !== "ar-dz") language = "ar-dz";

  return { language, mix, script, dz };
}

/* ─────────────────────────── intents ─────────────────────────── */

export const INTENT_LABEL_AR: Record<MindIntent, string> = {
  greet: "تحية",
  smalltalk: "دردشة خفيفة",
  question: "سؤال مباشر",
  build_game: "صناعة لعبة",
  build_site: "بناء موقع",
  build_app: "بناء تطبيق",
  build_ui: "تصميم واجهة",
  code_write: "كتابة كود",
  code_fix: "إصلاح كود",
  code_explain: "شرح كود",
  translate: "ترجمة",
  summarize: "تلخيص",
  write_content: "كتابة محتوى",
  study: "دراسة وحل تمرين",
  math: "رياضيات ومنطق",
  business: "تجارة ومشروع",
  marketing: "تسويق وإعلان",
  image: "صورة أو تصميم بصري",
  video: "فيديو أو مشهد متحرك",
  music: "موسيقى أو صوت",
  analyse: "تحليل بيانات أو مقارنة",
  complaint: "شكوى أو مشكلة",
  emotional: "دعم معنوي",
  chat: "محادثة عامة",
};

/** Tie-break order: the more specific intent wins an equal score. */
const INTENT_RANK: MindIntent[] = [
  "build_game", "code_fix", "build_site", "build_app", "study", "math", "translate",
  "summarize", "image", "video", "music", "build_ui", "code_explain", "marketing",
  "write_content", "analyse", "complaint", "emotional", "business", "code_write",
  "question", "smalltalk", "greet", "chat",
];

const INTENT_PATTERNS: { id: MindIntent; w: number; re: RegExp }[] = [
  { id: "build_game", w: 6, re: /(لعب[ةه]|العاب|ألعاب|الالعاب|arcade|منص[ةات]|ثعبان|سباق\s?سيارات|\bgame\b|\bjeu\b|\bjeux\b|playable|قابلة\s?للعب|العبها|اركيد|أركيد)/i },
  { id: "build_game", w: 3, re: /(بلايستيشن|أتاري|ماريو|بوكيمون|ماين\s?كرافت|ماينكرافت|ببجي|فورتنايت|tetris|سودوكو|شطرنج)/i },
  { id: "build_site", w: 6, re: /(موقع|صفحة\s?هبوط|landing|متجر\s?الكتروني|\bsite\b|\bwebsite\b|\bsaas\b|portfolio|محفظة|مدونة)/i },
  { id: "build_app", w: 6, re: /(تطبيق|برنامج\s?كامل|نظام|منصة|\bapp\b|application|dashboard|لوحة\s?تحكم|\bapi\b)/i },
  { id: "build_ui", w: 5, re: /(واجهة|تصميم\s?ui|ui\s?ux|شاشة|خلفية|wallpaper|شعار|logo|أيقون|ايقون|ملصق|poster)/i },
  { id: "code_write", w: 5, re: /(اكتب\s?لي\s?كود|كود|سكريبت|سكربت|دالة|function|script|\bcode\b|خوارزمي|python|javascript|react|sql|php|java\b|flutter|html|css|typescript|node\b)/i },
  { id: "code_fix", w: 6, re: /(خطأ|خطاء|غلط|باغ|\bbug\b|error|مش\s?يخدم|ما\s?يخدمش|لا\s?يعمل|توقف|crash|exception|undefined|\bnan\b|اصلح|أصلح|صلح|صحح\s?الكود|\bfix\b|debug|لماذا\s?لا)/i },
  { id: "code_explain", w: 5, re: /(اشرح\s?الكود|شرح\s?الكود|فهم\s?الكود|explain\s?(this\s?)?code|what\s?does\s?this|كيف\s?يعمل|كيفاش\s?يخدم)/i },
  { id: "translate", w: 6, re: /(ترجم|ترجمة|بالانجليزية|بالإنجليزية|بالفرنسية|بالعربية|بالدارجة|بالاسبانية|translate|tradui|traduction|باللغة)/i },
  { id: "summarize", w: 6, re: /(لخص|تلخيص|ملخص|اختصر|خلاصة|summari[sz]e|résume|resume|tl;?dr)/i },
  { id: "study", w: 6, re: /(باك|بكالوريا|\bbem\b|\bbac\b|المتوسط|الثانوي|الابتدائي|درس|دروس|تمرين|فرض|امتحان|اختبار|مذاكرة|مراجعة|حل\s?التمرين|شرح\s?الدرس|مذكرة|تخرج|جامعة|درسني|معلم|مدرّس)/i },
  { id: "math", w: 6, re: /(احسب|حساب|معادل[ةه]|مشتق|تكامل|احتمال|هندسة|رياضيات|مسألة|مساله|برهن|أثبت|solve|calculate|equation|derivative|integral|probability|maths?|calcule)/i },
  { id: "business", w: 5, re: /(مشروع|تجارة|بيع|شراء|منتج|متجر|زبون|تكلفة|ربح|استثمار|خطة\s?عمل|business|plan\s?d'affaires|dropshipping|e-?commerce|chargily|edahabia|سجل\s?تجاري)/i },
  { id: "marketing", w: 5, re: /(اعلان|إعلان|حملة|تسويق|منشور|سبونسور|سلوغان|شعار\s?تجاري|marketing|campaign|تيك\s?توك|انستغرام|فيسبوك|يوتيوب)/i },
  { id: "write_content", w: 5, re: /(اكتب|كتب\s?لي|كتبلي|مقال|رسال[ةه]|ايميل|إيميل|بريد|سيرة\s?ذاتية|\bcv\b|قصة|قصيدة|شعر|سيناريو|وصف\s?منتج|write|essay|rédige|redige|email|letter|cv)/i },
  { id: "image", w: 6, re: /(صور[ةه]|صور|ارسم|رسم|توليد\s?صورة|image|picture|draw|خلفية\s?لهاتفي)/i },
  { id: "video", w: 6, re: /(فيديو|مقطع|clip|video|ريلز|reels|مشهد\s?متحرك)/i },
  { id: "music", w: 6, re: /(موسيقى|اغنية|أغنية|لحن|music|song|beat|مقطوعة|web\s?audio)/i },
  { id: "analyse", w: 5, re: /(حلل|تحليل|قارن|مقارنة|احصائ|إحصائ|بيانات|جدول|analy[sz]e|compare|statistics|\bdata\b|chart)/i },
  { id: "complaint", w: 5, re: /(مشكلة|مش\s?رايح|ما\s?رايح|لا\s?يعمل\s?عندي|خربان|سيء|زبل|ما\s?فهمت|غاضب|زعلان|problème|probleme|ne\s?marche\s?pas|broken|awful|terrible)/i },
  { id: "emotional", w: 5, re: /(حزين|مكتئب|تعبان|قلقان|خايف|وحيد|ضغط|اجهاد|إجهاد|نفسي|sad|depressed|anxious|lonely|stressed)/i },
  { id: "greet", w: 4, re: /^\s*(السلام|سلام|صباح|مساء|اهلا|أهلا|مرحبا|هاي|hi|hello|hey|salut|bonjour|bonsoir|coucou)\b/i },
  { id: "smalltalk", w: 3, re: /(كيف\s?حالك|كيفاش\s?راك|واش\s?راك|شخبارك|من\s?انت|من\s?أنت|ما\s?اسمك|comment\s?ça\s?va|how\s?are\s?you|who\s?are\s?you|ça\s?va)/i },
  { id: "question", w: 2, re: /(هل|ما\s?هو|ما\s?هي|ماذا|لماذا|متى|أين|كيف|est-?ce|qu'est|pourquoi|comment|when|where|what|why|who|how|\?)/i },
];

function scoreIntents(text: string, squashed: string): {
  intent: MindIntent;
  confidence: number;
  alt: MindIntent | null;
} {
  const score = new Map<MindIntent, number>();
  const t = ` ${text} `;
  for (const p of INTENT_PATTERNS) {
    if (p.re.test(t) || p.re.test(` ${squashed} `)) score.set(p.id, (score.get(p.id) ?? 0) + p.w);
  }
  if (/```/.test(text)) {
    score.set("code_write", (score.get("code_write") ?? 0) + 5);
    if (/(خطأ|error|bug|مش\s?يخدم|fix|لا\s?يعمل)/i.test(text))
      score.set("code_fix", (score.get("code_fix") ?? 0) + 6);
  }
  if (/(ابني|اصنع|اعمل|صمم|أنشئ|انشئ|ولد|build|make|create|generate|construi|cré[eé])/i.test(text)) {
    for (const k of ["build_game", "build_site", "build_app", "build_ui"] as const)
      if (score.has(k)) score.set(k, (score.get(k) ?? 0) + 2);
  }
  if (!score.size) {
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    return { intent: words <= 3 ? "greet" : "chat", confidence: words <= 3 ? 62 : 40, alt: null };
  }
  const rank = (id: MindIntent) => {
    const i = INTENT_RANK.indexOf(id);
    return i < 0 ? 99 : i;
  };
  const ranked = [...score.entries()].sort(
    (a, b) => b[1] - a[1] || rank(a[0]) - rank(b[0])
  );
  const [top, topScore] = ranked[0];
  const second = ranked[1];
  const gap = second ? topScore - second[1] : topScore;
  const evidence = Math.min(1, topScore / 12);
  const margin = Math.min(1, gap / 6);
  const confidence = Math.round(38 + evidence * 40 + margin * 22);
  return {
    intent: top,
    confidence: Math.max(35, Math.min(99, confidence)),
    alt: second ? second[0] : null,
  };
}

/* ─────────────────────────── entities ─────────────────────────── */

const WILAYAS = [
  "الجزائر العاصمة", "وهران", "قسنطينة", "عنابة", "سطيف", "باتنة", "بجاية", "تيزي وزو",
  "البليدة", "ورقلة", "بشار", "الشلف", "الجلفة", "المدية", "المسيلة", "سكيكدة", "تيبازة",
  "الوادي", "غرداية", "تلمسان", "سيدي بلعباس", "بومرداس", "الطارف", "خنشلة", "سوق أهراس",
  "أم البواقي", "برج بوعريريج", "تبسة", "النعامة", "البيض", "أدرار", "الأغواط", "تمنراست",
  "اليزي", "جيجل", "قالمة", "ميلة", "عين الدفلى", "عين تموشنت", "الجزائر",
];

const LEVEL_WORDS = [
  "ابتدائي", "متوسط", "ثانوي", "باك", "بكالوريا", "bem", "bac", "اولى", "أولى",
  "ثانية", "ثالثة", "رابعة", "خامسة", "جامعة", "ماستر", "ليسانس", "نهائي",
];

const CODE_LANGS = [
  "javascript", "typescript", "python", "java", "c++", "c#", "php", "ruby", "go",
  "rust", "kotlin", "swift", "dart", "flutter", "react", "next.js", "nextjs", "vue",
  "svelte", "html", "css", "tailwind", "sql", "postgres", "mysql", "mongodb",
  "firebase", "node", "express", "django", "laravel", "spring", "unity", "three.js",
  "godot", "js", "ts", "py",
];

const TARGET_LANGS = [
  "العربية", "الانجليزية", "الإنجليزية", "الفرنسية", "الدارجة", "الاسبانية", "الإسبانية",
  "الالمانية", "الألمانية", "التركية", "الصينية", "عربية", "انجليزية", "فرنسية",
  "arabic", "english", "french", "spanish", "german", "turkish", "arabe", "anglais",
  "français", "francais", "espagnol", "allemand", "turc", "chinois",
];

const uniq = <T,>(a: T[]): T[] => [...new Set(a)];

function extractEntities(text: string): MindEntities {
  const e: MindEntities = {
    money: [], dates: [], times: [], urls: [], emails: [], phones: [],
    places: [], levels: [], quantities: [], languages: [], codeLangs: [],
    numbers: [], quoted: [], people: [],
  };
  const lower = text.toLowerCase();

  const moneyRe =
    /(\d[\d\s.,]*)\s*(دج|دينار|dzd|da\b|€|euro|euros|\$|dollar|dollars|ريال|درهم)/gi;
  const seenMoney = new Set<string>();
  for (const m of text.matchAll(moneyRe)) {
    const amount = Number(m[1].replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = m[2].trim().toLowerCase();
    const key = `${amount}:${currency}`;
    if (seenMoney.has(key)) continue;
    seenMoney.add(key);
    e.money.push({ amount, currency, raw: m[0].trim() });
  }
  for (const m of text.matchAll(/(€|\$)\s*(\d[\d\s.,]*)/g)) {
    const amount = Number(m[2].replace(/[^\d.]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const currency = m[1] === "€" ? "eur" : "usd";
    if (seenMoney.has(`${amount}:${currency}`)) continue;
    seenMoney.add(`${amount}:${currency}`);
    e.money.push({ amount, currency, raw: m[0].trim() });
  }

  e.urls = uniq([...text.matchAll(/https?:\/\/[^\s)"']+/gi)].map((m) => m[0])).slice(0, 8);
  e.emails = uniq([...text.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0])).slice(0, 8);
  e.phones = uniq(
    [...text.matchAll(/(?:\+?213|0)[567]\d{8}/g)].map((m) => m[0].replace(/\s+/g, ""))
  ).slice(0, 5);

  const dateWords =
    /(اليوم|غدا|غدًا|البارحة|أمس|امس|الاسبوع|الأسبوع|الشهر|رمضان|العيد|نهاية\s?الاسبوع|نهاية\s?الأسبوع|today|tomorrow|yesterday|weekend|aujourd'hui|demain|hier|après-?midi|صباحا|صباحًا|مساء|ليل)/gi;
  e.dates = uniq([...text.matchAll(dateWords)].map((m) => m[0].trim())).slice(0, 8);
  for (const m of text.matchAll(/\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?(?:am|pm)\b/gi))
    e.times.push(m[0].trim());
  for (const m of text.matchAll(/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g))
    e.dates.push(m[0]);
  e.dates = uniq(e.dates);

  for (const w of WILAYAS) if (text.includes(w) && !e.places.includes(w)) e.places.push(w);
  if (/\b(algeria|alg[ée]rie)\b/i.test(lower) && !e.places.includes("الجزائر"))
    e.places.push("الجزائر");

  for (const l of LEVEL_WORDS) {
    const esc = l.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu");
    if (re.test(text)) e.levels.push(l);
  }
  e.levels = uniq(e.levels);

  for (const m of text.matchAll(
    /(\d+(?:[.,]\d+)?)\s*(ساعة|ساعات|دقيقة|دقائق|يوم|أيام|ايام|اسبوع|أسبوع|شهر|سنة|صفحة|صفحات|كلمة|كلمات|مستوى|مستويات|مراحل|مرحلة|سطر|اسطر|أسطر|سؤال|اسئلة|أسئلة|hours?|minutes?|days?|weeks?|months?|years?|pages?|words?|levels?|lines?|questions?|heures?|jours?|mots?|paragraphes?)/gi
  )) {
    const value = Number(m[1].replace(",", "."));
    if (Number.isFinite(value) && value > 0)
      e.quantities.push({ value, unit: m[2].toLowerCase() });
  }

  for (const c of CODE_LANGS) if (lower.includes(c) && !e.codeLangs.includes(c)) e.codeLangs.push(c);
  for (const l of TARGET_LANGS) if (lower.includes(l.toLowerCase()) && !e.languages.includes(l))
    e.languages.push(l);

  e.quoted = uniq([...text.matchAll(/["«]([^"»\n]{2,60})["»]/g)].map((m) => m[1].trim())).slice(0, 6);
  e.people = uniq([...text.matchAll(/@([A-Za-z0-9_.]{3,30})/g)].map((m) => m[1])).slice(0, 6);
  e.numbers = uniq(
    [...text.matchAll(/(?<![\w.])\d+(?:[.,]\d+)?(?![\w])/g)]
      .map((m) => Number(m[0].replace(",", ".")))
      .filter((n) => Number.isFinite(n))
  ).slice(0, 12);

  return e;
}

/* ─────────────────────────── mood & shape ─────────────────────────── */

const POSITIVE =
  /(ممتاز|رائع|جميل|شكرا|بارك|احببت|أحببت|يعجبني|خرافي|احسنت|أحسنت|top|génial|genial|super|merci|parfait|great|awesome|thanks|perfect|love it|excellent)/i;
const NEGATIVE =
  /(سيء|سيئ|زبل|خايس|خربان|غبي|فاشل|ما\s?فهمت|مش\s?مفيد|غير\s?مفيد|كارثة|ضعيف|بطيء|ممل|nul|mauvais|horrible|inutile|lent|bad|awful|terrible|useless|stupid|worst|hate)/i;
const URGENT =
  /(بسرعة|مستعجل|urgent|asap|vite|دابا|الآن|حالا|فورا|اليوم|important|هام|مهم|ضروري|critique|حرج|deadline|لأجل|الاجل)/i;
const AUDIENCE_RE =
  /(للزبائن|للطلاب|للتلاميذ|للأطفال|للاطفال|للمبتدئين|للمحترفين|للشركة|للمعلم|للاساتذة|للأساتذة|للنساء|للرجال|للشباب|pour\s?(?:les|des|mon|ma)|for\s?(?:kids|students|beginners|experts|customers|my|the)|audience|الجمهور)/i;

const STOPWORDS = new Set([
  "في", "من", "على", "الى", "إلى", "عن", "مع", "هذا", "هذه", "ذلك", "التي", "الذي",
  "كان", "يكون", "هو", "هي", "نحن", "انت", "أنت", "انا", "أنا", "ما", "لا", "لم", "لن",
  "قد", "ثم", "او", "أو", "و", "ان", "أن", "كل", "بعض", "بين", "عند", "حتى", "كيف",
  "لي", "لها", "له", "لك", "هم", "ها", "يا", "the", "and", "or", "of", "to", "in",
  "for", "is", "are", "it", "this", "that", "with", "you", "me", "my", "on", "at",
  "be", "do", "le", "la", "les", "un", "une", "et", "ou", "de", "des", "du", "pour",
  "avec", "sur", "dans", "est", "je", "tu", "il", "ce", "ces", "mon", "ma", "que",
  "qui", "a", "an", "as", "was", "were",
]);

function keywordsOf(normalized: string): string[] {
  const words = normalized
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 10)
    .map(([w]) => w);
}

function deliverableShape(text: string, intent: MindIntent, words: number) {
  let format: DeliverableFormat = "text";
  if (/```|\bcode\b|كود|سكريبت|function|دالة/.test(text)) format = "code";
  if (/(html|صفحة\s?ويب|موقع|لعبة|web\s?page|single\s?file|تطبيق)/i.test(text)) format = "html";
  if (/(جدول|\btable\b|csv|مقارنة\s?بين)/i.test(text)) format = "table";
  if (/(خطوات|steps|قائمة|list|نقاط|bullet|etapes|étapes)/i.test(text)) format = "list";
  if (/(\bjson\b|api\s?response)/i.test(text)) format = "json";
  if (intent === "build_game" || intent === "build_site" || intent === "build_app") format = "html";
  if (intent === "code_write") format = "code";
  if (intent === "study" || intent === "math") format = "steps";

  let length: MindReading["deliverable"]["length"] = "medium";
  if (/(باختصار|قصير|مختصر|سطر\s?واحد|short|brief|en bref|juste|جملة\s?واحدة)/i.test(text)) length = "short";
  else if (/(مفصل|تفصيلي|طويل|كامل|شامل|deep|detailed|long|full|complet|كاملا|كاملة|ضخم)/i.test(text)) length = "long";
  else if (format === "html" || format === "code") length = "long";
  else if (words > 60) length = "long";
  else if (words < 12) length = "short";

  const language: MindReading["deliverable"]["language"] =
    /(بالانجليزية|بالإنجليزية|in english|en anglais|anglais)/i.test(text)
      ? "en"
      : /(بالفرنسية|in french|en français|en francais|français)/i.test(text)
        ? "fr"
        : /(بالعربية|بالدارجة|in arabic|en arabe)/i.test(text)
          ? "ar"
          : "match";
  return { format, length, language };
}

/* ─────────────────────────── missing info ─────────────────────────── */

function findMissing(
  intent: MindIntent,
  text: string,
  e: MindEntities
): { key: string; question: string; guess: string }[] {
  const out: { key: string; question: string; guess: string }[] = [];

  switch (intent) {
    case "build_game":
      if (!/(نوع|genre|arcade|أركيد|اركيد|منصات|الغاز|ألغاز|سباق|رماية|puzzle|racing|shooter|platformer|runner|ثعبان|snake|ذاكرة|اسئلة|أسئلة|quiz)/i.test(text))
        out.push({ key: "genre", question: "أي نوع لعبة تحب؟ (أركيد · منصات · ألغاز · سباق · رماية)", guess: "أركيد سريع" });
      if (!/(صعبة|صعبة|سهلة|متوسطة|easy|hard|medium|difficile|facile)/i.test(text))
        out.push({ key: "difficulty", question: "الصعوبة تكون كيفاش؟", guess: "متوسطة تتصاعد" });
      break;
    case "build_site":
    case "build_app":
      if (!e.quoted.length && !/(متجر|مطعم|عيادة|مدرسة|شركة|مدونة|portfolio|محفظة|صيدلية|صالون|مقهى|مكتبة|قاعة)/i.test(text))
        out.push({ key: "subject", question: "الموقع/التطبيق على واش بالظبط؟", guess: "نشاط تجاري عام" });
      if (!/(صفحات|pages|اقسام|أقسام|features|ميزات|سلة|حجز|تسجيل|login)/i.test(text))
        out.push({ key: "scope", question: "واش الأقسام اللي تريدها فيه؟", guess: "رئيسية + خدمات + اتصل بنا" });
      break;
    case "translate":
      if (!e.languages.length)
        out.push({ key: "target", question: "نترجمها لأي لغة؟", guess: "الإنجليزية" });
      break;
    case "write_content":
      if (!/(منشور|مقال|رسالة|ايميل|إيميل|cv|سيرة|وصف|post|email|article|description)/i.test(text))
        out.push({ key: "shape", question: "واش الشكل المطلوب؟ (منشور · مقال · إيميل · سيرة ذاتية)", guess: "منشور قصير" });
      if (!e.money.length && /(منتج|بيع|سعر|عرض)/.test(text))
        out.push({ key: "price", question: "واش السعر والعرض؟", guess: "بدون سعر" });
      break;
    case "study":
      if (!e.levels.length && !/(باك|bem|bac|متوسط|ثانوي|ابتدائي|جامعة)/i.test(text))
        out.push({ key: "level", question: "واش مستواك؟ (متوسط · ثانوي · باك · جامعة)", guess: "ثانوي" });
      if (!/(المادة|مادة|رياضيات|فيزياء|علوم|تاريخ|جغرافيا|فلسفة|انجليزية|فرنسية|عربية)/i.test(text))
        out.push({ key: "subject", question: "أي مادة؟", guess: "من نص التمرين" });
      break;
    case "business":
      if (!e.money.length && !/(رأس\s?مال|ميزانية|budget|capitale)/i.test(text))
        out.push({ key: "budget", question: "واش الميزانية التقريبية بالدينار؟", guess: "ميزانية صغيرة" });
      if (!e.places.length && !/(ولاية|مدينة|ville)/i.test(text))
        out.push({ key: "city", question: "فأي ولاية/مدينة؟", guess: "الجزائر (عام)" });
      break;
    case "marketing":
      if (!/(فيسبوك|انستغرام|تيك\s?توك|يوتيوب|facebook|instagram|tiktok|youtube|linkedin)/i.test(text))
        out.push({ key: "platform", question: "ننشره فين؟ (فيسبوك · إنستغرام · تيك توك)", guess: "فيسبوك" });
      break;
    case "code_write":
      if (!e.codeLangs.length)
        out.push({ key: "stack", question: "بأي لغة/تقنية؟", guess: "JavaScript" });
      break;
    case "code_fix":
      if (!/```|error|خطأ|رسالة|message|stack/i.test(text))
        out.push({ key: "error", question: "لصقلي رسالة الخطأ أو الكود باش نقدر نصلحه بدقة", guess: "سأفحص الكود كاملاً" });
      break;
    case "image":
      if (!/(مقاس|حجم|size|dimension|1080|1920|الهاتف|حاسوب|wallpaper)/i.test(text))
        out.push({ key: "size", question: "واش المقاس؟ (هاتف عمودي · حاسوب أفقي)", guess: "عمودي للهاتف" });
      break;
    default:
      break;
  }
  if (out.length > 2) out.length = 2;
  return out;
}

/* ─────────────────────────── domain ─────────────────────────── */

const DOMAINS: { label: string; re: RegExp }[] = [
  { label: "ألعاب", re: /(لعب|game|jeu|arcade|أركيد|منصات|puzzle)/i },
  { label: "رياضيات ومنطق", re: /(مشتق|تكامل|معادل[ةه]|احسب|رياضيات|احتمال|هندسة|مسأل[ةه]|دالة|متتالي[ةه]|مصفوف|maths?|equation|derivative|integral)/i },
  { label: "برمجة", re: /(كود|\bcode\b|\bapi\b|function|سكريبت|سكربت|python|javascript|react|sql|خطأ|bug|موقع|تطبيق|html|css)/i },
  { label: "تعليم", re: /(درس|تمرين|امتحان|باك|bem|متوسط|ثانوي|جامعة|مذكرة)/i },
  { label: "تجارة", re: /(منتج|متجر|بيع|سعر|زبون|توصيل|e-?commerce|dropshipping)/i },
  { label: "تسويق", re: /(اعلان|إعلان|حملة|منشور|تسويق|انستغرام|فيسبوك|تيك\s?توك)/i },
  { label: "كتابة", re: /(مقال|رسالة|ايميل|إيميل|سيرة|cv|قصة|شعر|محتوى)/i },
  { label: "بصريات", re: /(صورة|صور|فيديو|تصميم|خلفية|شعار|logo|image|video)/i },
  { label: "صحة ونفسية", re: /(حزين|قلق|تعب|مرض|طبيب|دواء|نفسية|santé|stress)/i },
  { label: "مال وقانون", re: /(ضريبة|قانون|عقد|بنك|تأمين|chargily|edahabia|سجل\s?تجاري)/i },
];

const LANG_NAME: Record<MindLanguage, string> = {
  ar: "العربية الفصحى",
  "ar-dz": "الدارجة الجزائرية",
  fr: "الفرنسية",
  en: "الإنجليزية",
  mixed: "خليط (عربية + لاتينية)",
};

const FORMAT_AR: Record<DeliverableFormat, string> = {
  text: "نص",
  markdown: "مستند",
  code: "كود",
  html: "ملف HTML قابل للتشغيل",
  table: "جدول",
  list: "قائمة",
  steps: "خطوات مرقّمة",
  json: "JSON",
};
const LENGTH_AR: Record<MindReading["deliverable"]["length"], string> = {
  short: "قصير",
  medium: "متوسط",
  long: "طويل ومفصّل",
};

/** The subset of the platform's Task union a reading can legitimately imply. */
export type MindTask = "code" | "reasoning" | "creative" | "writing" | "quick" | "general";

/* Typed against MindTask on purpose: a greeting used to map to "chat", which is
 * not a real Task and would have reached the engine router as an unknown route. */
const TASK_BY_INTENT: Record<MindIntent, MindTask> = {
  greet: "quick", smalltalk: "quick", question: "general", build_game: "code",
  build_site: "code", build_app: "code", build_ui: "code", code_write: "code",
  code_fix: "code", code_explain: "code", translate: "writing", summarize: "writing",
  write_content: "writing", study: "reasoning", math: "reasoning", business: "writing",
  marketing: "creative", image: "creative", video: "creative", music: "creative",
  analyse: "reasoning", complaint: "general", emotional: "general", chat: "general",
};

/** Maps a reading onto the platform's existing engine router (task-router.ts). */
export function mindTask(reading: Pick<MindReading, "intent" | "entities">): MindTask {
  if (reading.entities.urls.length && reading.intent !== "code_fix") return "reasoning";
  return TASK_BY_INTENT[reading.intent] ?? "general";
}

/* ─────────────────────────── the reader ─────────────────────────── */

/** One reading, everything the app needs. Safe on any input, never throws. */
export function readMind(input: string): MindReading {
  const t0 = Date.now();
  const src = typeof input === "string" ? input : "";
  const n = normalizeText(src);
  const squashed = n.clean.replace(/(.)\1+/g, "$1");
  const lang = detectLanguage(n.clean, n.normalized, n.arabizi);
  const intentRes = scoreIntents(`${n.clean}\n${n.normalized}`, squashed);
  const entities = extractEntities(bothSpellings(n.clean, n.normalized));
  const words = n.clean.split(/\s+/).filter(Boolean).length;

  const pos = POSITIVE.test(n.clean);
  const neg = NEGATIVE.test(n.clean);
  const sentimentScore = (pos ? 1 : 0) - (neg ? 1 : 0);
  const sentiment = {
    score: sentimentScore,
    label: (sentimentScore > 0 ? "positive" : sentimentScore < 0 ? "negative" : "neutral") as Sentiment,
  };
  const urgency: Urgency =
    /(urgent|asap|بسرعة|مستعجل|ضروري|دابا|فورا)/i.test(n.clean) || /!{2,}/.test(n.clean)
      ? "high"
      : URGENT.test(n.clean)
        ? "normal"
        : "low";

  const clauses =
    (n.clean.match(/\s(?:و|ثم|and|then|puis|ensuite|also|ايضا|أيضًا|كذلك|بعد\s?ما)\s/gi) ?? []).length;
  const constraints =
    entities.money.length + entities.quantities.length + entities.dates.length + entities.places.length;
  const complexity: Complexity =
    words > 90 || clauses >= 4 || constraints >= 4 || /```/.test(n.clean)
      ? "complex"
      : words > 25 || clauses >= 2 || constraints >= 2
        ? "medium"
        : "simple";

  const deliverable = deliverableShape(n.clean, intentRes.intent, words);
  const domain = DOMAINS.find((d) => d.re.test(n.clean))?.label ?? "عام";
  const missing = findMissing(intentRes.intent, `${n.clean} ${n.normalized}`, entities);
  const keywords = keywordsOf(n.normalized);
  const audience = AUDIENCE_RE.test(n.clean) ? (n.clean.match(AUDIENCE_RE)?.[0] ?? "").trim() : null;

  const facts = [
    ...entities.money.map((m) => m.raw),
    ...entities.places,
    ...entities.levels,
    ...entities.dates,
    ...entities.quantities.map((q) => `${q.value} ${q.unit}`),
  ].slice(0, 6);

  const explain = [
    `اللغة: ${LANG_NAME[lang.language]} (عربية ${lang.mix.arabic}% · لاتينية ${lang.mix.latin}%)` +
      (n.arabizi ? " · مكتوبة بحروف لاتينية (عربيزي)" : ""),
    `النية: ${INTENT_LABEL_AR[intentRes.intent]} — ثقة ${intentRes.confidence}%` +
      (intentRes.alt ? ` · أو ربما ${INTENT_LABEL_AR[intentRes.alt]}` : ""),
    `المجال: ${domain} · التعقيد: ${
      complexity === "complex" ? "مركّب" : complexity === "medium" ? "متوسط" : "بسيط"
    } · ${words} كلمة`,
    `المطلوب: ${FORMAT_AR[deliverable.format]} · طول ${LENGTH_AR[deliverable.length]}`,
    facts.length ? `المعطيات: ${facts.join(" · ")}` : "المعطيات: لا أرقام ولا أسماء مكان في الطلب",
    `المزاج: ${
      sentiment.label === "positive" ? "إيجابي" : sentiment.label === "negative" ? "سلبي" : "محايد"
    } · الاستعجال: ${
      urgency === "high" ? "مستعجل" : urgency === "normal" ? "عادي" : "هادئ"
    }`,
    n.protectedSpans
      ? `حميتُ ${n.protectedSpans} مقطعًا من الكود/الروابط من أي تصحيح`
      : "لا كود ولا روابط في الطلب",
    n.corrections.length ? `صحّحت: ${n.corrections.join(" · ")}` : "لم أحتج تصحيح أي كلمة",
    missing.length ? `ناقص: ${missing.map((m) => m.question).join(" · ")}` : "الطلب كامل — لا سؤال ناقص",
  ];

  return {
    raw: src,
    clean: n.clean,
    normalized: n.normalized,
    language: lang.language,
    languageMix: lang.mix,
    script: lang.script,
    arabizi: n.arabizi,
    intent: intentRes.intent,
    intentLabel: INTENT_LABEL_AR[intentRes.intent],
    altIntent: intentRes.alt,
    altIntentLabel: intentRes.alt ? INTENT_LABEL_AR[intentRes.alt] : null,
    confidence: intentRes.confidence,
    domain,
    entities,
    sentiment,
    urgency,
    complexity,
    deliverable,
    audience,
    missing,
    keywords,
    words,
    explain,
    brief: buildBrief({
      language: lang.language,
      mix: lang.mix,
      intent: intentRes.intent,
      confidence: intentRes.confidence,
      domain,
      entities,
      sentiment,
      urgency,
      complexity,
      deliverable,
      audience,
      missing,
      keywords,
      words,
    }),
    corrections: n.corrections,
    protectedSpans: n.protectedSpans,
    ms: Math.max(1, Date.now() - t0),
  };
}

/** Entity extraction runs on both spellings so nothing is missed. */
function bothSpellings(a: string, b: string): string {
  return a === b ? a : `${a}\n${b}`;
}

interface BriefInput {
  language: MindLanguage;
  mix: { arabic: number; latin: number };
  intent: MindIntent;
  confidence: number;
  domain: string;
  entities: MindEntities;
  sentiment: { score: number; label: Sentiment };
  urgency: Urgency;
  complexity: Complexity;
  deliverable: { format: DeliverableFormat; length: string; language: string };
  audience: string | null;
  missing: { key: string; question: string; guess: string }[];
  keywords: string[];
  words: number;
}

/**
 * The block the model actually receives. Deliberately short and structured:
 * models follow a compact brief far better than prose, and every line here is
 * machine-derived from the user's own words — no invented facts.
 */
export function buildBrief(i: BriefInput): string {
  const answerLang =
    i.deliverable.language !== "match"
      ? i.deliverable.language
      : i.language === "fr"
        ? "fr"
        : i.language === "en"
          ? "en"
          : "ar";
  const lines: string[] = [];
  lines.push(
    `Reader language: ${answerLang.toUpperCase()} (detected ${i.language}, arabic ${i.mix.arabic}% / latin ${i.mix.latin}%).`
  );
  if (i.language === "mixed" || i.language === "ar-dz")
    lines.push(
      "Code-switching detected (Algerian Darija + French). Answer in clear Arabic with a warm Darija flavour, keep French/English technical terms exactly as the user wrote them, and never mock or over-explain the dialect."
    );
  lines.push(`Intent: ${INTENT_LABEL_AR[i.intent]} / ${i.intent} (confidence ${i.confidence}%).`);
  lines.push(`Domain: ${i.domain}. Complexity: ${i.complexity} (${i.words} words).`);
  lines.push(
    `Deliverable: ${i.deliverable.format}, ${i.deliverable.length} output.` +
      (i.deliverable.format === "html" || i.deliverable.format === "code"
        ? " Ship ONE complete, runnable artefact — no stubs, no placeholders, no 'rest of the code'."
        : " No filler, no preamble, no 'as an AI'.")
  );
  const facts: string[] = [];
  const e = i.entities;
  if (e.money.length) facts.push(`budget/price=${e.money.map((m) => `${m.amount} ${m.currency}`).join(", ")}`);
  if (e.places.length) facts.push(`location=${e.places.slice(0, 4).join(", ")}`);
  if (e.levels.length) facts.push(`school level=${e.levels.slice(0, 4).join(", ")}`);
  if (e.dates.length) facts.push(`when=${e.dates.slice(0, 4).join(", ")}`);
  if (e.quantities.length) facts.push(`sizes=${e.quantities.slice(0, 6).map((q) => `${q.value} ${q.unit}`).join(", ")}`);
  if (e.codeLangs.length) facts.push(`stack=${e.codeLangs.slice(0, 6).join(", ")}`);
  if (e.languages.length) facts.push(`target language=${e.languages.slice(0, 3).join(", ")}`);
  if (e.urls.length) facts.push(`links=${e.urls.slice(0, 3).join(", ")}`);
  if (e.quoted.length) facts.push(`named subject="${e.quoted.slice(0, 3).join('", "')}"`);
  if (i.audience) facts.push(`audience=${i.audience}`);
  if (facts.length) lines.push(`Known facts: ${facts.join(" · ")}.`);
  lines.push(
    `Tone: ${
      i.sentiment.label === "negative"
        ? "the user sounds frustrated — acknowledge in ONE short line, then fix it"
        : i.sentiment.label === "positive"
          ? "the user is happy — keep the energy, stay useful"
          : "neutral"
    }${i.urgency === "high" ? ", URGENT — answer first, explain after" : ""}.`
  );
  if (i.keywords.length) lines.push(`Keywords: ${i.keywords.slice(0, 8).join(", ")}.`);
  for (const m of i.missing)
    lines.push(
      `Unsaid (${m.key}): ${m.question} → assume "${m.guess}" and state that assumption in ONE short line instead of asking.`
    );
  return `\n\nUNDERSTANDING BRIEF — machine-read from the user's message. Honour it silently; never mention, quote or list this brief.\n${lines
    .map((l) => `- ${l}`)
    .join("\n")}`;
}

/* ─────────────────────────── UI helpers ─────────────────────────── */

/** Chips under the 🧠 card — each answers a "missing" slot in one tap. */
/**
 * A chip is actionable, not decorative:
 *  - `fill`  → append `text` to the draft (answers a slot the user left unsaid)
 *  - `route` → jump to `href` (the right tool for the detected intent)
 *  - `tone`  → append a one-line style instruction
 */
export interface MindChip {
  label: string;
  kind: "fill" | "route" | "tone";
  text?: string;
  href?: string;
}

export function mindChips(r: MindReading): MindChip[] {
  const chips: MindChip[] = [];
  for (const m of r.missing) {
    chips.push({ label: `${m.key === "genre" ? "النوع" : m.key === "difficulty" ? "الصعوبة" : m.key}: ${m.guess}`, kind: "fill", text: m.guess });
  }
  if (r.intent === "build_game")
    chips.push({ label: "لعبة فورية من SMITH ⚡", kind: "route", href: "/app/smith" });
  if (r.intent === "build_site" || r.intent === "build_ui")
    chips.push({ label: "افتح الاستوديو 🎨", kind: "route", href: "/app/studio" });
  if (r.deliverable.language === "match" && r.language !== "ar")
    chips.push({ label: "بالعربية", kind: "tone", text: "اكتب الجواب بالعربية" });
  if (r.language === "ar" && r.deliverable.language === "match")
    chips.push({ label: "بالفرنسية", kind: "tone", text: "Rédige la réponse en français" });
  if (r.complexity === "complex")
    chips.push({ label: "خطة قبل التنفيذ", kind: "tone", text: "اعطني خطة قصيرة قبل التنفيذ" });
  if (r.urgency === "high")
    chips.push({ label: "مختصر وسريع", kind: "tone", text: "اختصر وأعطني الخلاصة أولًا" });
  const seen = new Set<string>();
  const out: MindChip[] = [];
  for (const c of chips) {
    if (seen.has(c.label)) continue;
    seen.add(c.label);
    out.push(c);
  }
  return out.slice(0, 4);
}

/** Plain labels, for logs / the API summary. */
export function mindChipLabels(r: MindReading): string[] {
  return mindChips(r).map((c) => c.label);
}

/** True when the request is vague enough that a clarifying chip genuinely helps. */
export function mindNeedsClarification(r: MindReading): boolean {
  return r.confidence < 55 && r.missing.length > 0 && r.words >= 3;
}

/** Compact one-liner for logs and the analytics table. */
export function mindSummary(r: MindReading): string {
  return `${r.intent}@${r.confidence}% ${r.language} ${r.domain} ${r.deliverable.format}/${r.deliverable.length}`;
}

/**
 * Small, safe summary sent to the analytics table — never the user's text,
 * only what MIND understood. Keeps `mind_events` privacy-friendly.
 */
export function mindTelemetry(r: MindReading) {
  return {
    intent: r.intent,
    lang: r.language,
    confidence: r.confidence,
    ms: r.ms,
    payload: {
      domain: r.domain,
      complexity: r.complexity,
      urgency: r.urgency,
      sentiment: r.sentiment.label,
      format: r.deliverable.format,
      length: r.deliverable.length,
      words: r.words,
      arabizi: r.arabizi,
      corrections: r.corrections.length,
      protected: r.protectedSpans,
      missing: r.missing.map((m) => m.key),
      facts: r.entities.money.length + r.entities.places.length + r.entities.quantities.length,
    },
  };
}
