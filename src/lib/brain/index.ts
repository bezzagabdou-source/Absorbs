/**
 * NEXUS BRAIN — retrieval.
 *
 * A small, dependency-free, offline search engine over the shipped corpus:
 *   · 1 541 communes + 69 wilayas  (names AR/FR, daïra, postal code, coordinates)
 *   · 95 universities · 135 filières · 115 university residences
 *   · ~35 curated fact cards (taxes, delivery, law, engineering, education)
 *
 * Why not embeddings? Because the numbers that matter in a chat are exact: the
 * postal code of a commune, the TVA rate, the price band of a courier. A BM25-ish
 * lexical ranker answers those instantly, deterministically, with a citation —
 * and it runs inside the same serverless function with no extra API and no
 * network round-trip. (Long-term *semantic* memory already exists in lib/memory.)
 *
 * Everything here is pure: the corpus is imported once, the index is built
 * lazily, and nothing mutates module state after the first call.
 */

import { WILAYAS, type WilayaRow } from "./data/wilayas";
import { COMMUNES, type CommuneRow } from "./data/communes";
import { UNIVERSITIES, type UniversityRow } from "./data/universities";
import { FILIERES, type FiliereRow } from "./data/filieres";
import { RESIDENCES, type ResidenceRow } from "./data/residences";
import { BRAIN_BUILT_AT, BRAIN_BYTES, BRAIN_ROWS, BRAIN_SOURCES } from "./data/sources";
import { CURATED_ROWS, type CuratedRow } from "./knowledge";

export interface BrainRow {
  /** what kind of record this is */
  kind: "wilaya" | "commune" | "university" | "filiere" | "residence" | "fact";
  /** stable id for citations and dedup */
  id: string;
  /** what the user sees as the title */
  title: string;
  /** the line injected into the prompt */
  text: string;
  /** where it came from (kept honest) */
  source: string;
  /** extra searchable words (tags, transliterations) */
  tags: string[];
  /** optional structured payload for the API/UI */
  meta?: Record<string, string | number | null>;
}

export interface BrainHit {
  row: BrainRow;
  score: number;
  /** which terms matched — shown in the UI to explain why this was retrieved */
  matched: string[];
}

export interface BrainStats {
  rows: number;
  byKind: Record<string, number>;
  bytes: number;
  builtAt: string;
  sources: { key: string; repo: string; file: string; rows: number; license: string }[];
}

/* --------------------------------------------------------------- arabic text */

/** Normalises Arabic (and French accents) so "بجاية" matches "بجايه" and "école" matches "ecole". */
export function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    /* harakat, tatweel and the hamza/madda marks NFKD leaves behind: without
       \u0653-\u0655 "أدرار" became "ا درار" and never matched "ادرار" */
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640\u200b-\u200f]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set(
  ("من في على عن الي الى مع هذا هذه ذلك التي الذي هو هي كان كانت كيف واش وش علاش لماذا متى اين وين قداش شحال بزاف قليلا جدا كامل كل بعض هل و او لا ما انا انت نحن هم the a an of to for in on with is are was were how what why when where which and or not do does"
  ).split(/\s+/)
);

/**
 * Algerians write technology names in Arabic letters ("فيرسل", "غيتهاب", "رياكت").
 * Rewriting them to Latin before indexing means those queries hit the real entries
 * instead of a commune whose name happens to share a few letters.
 */
const TRANSLIT: [RegExp, string][] = [
  [/فيرسيل|فيرسل|فرسل/g, "vercel"],
  [/غيتهاب|جيتهاب|غيت هاب|جيت هاب/g, "github"],
  [/رياكت|رياكت جي اس/g, "react"],
  [/نيكست|نكست|نكست جي اس/g, "nextjs"],
  [/جافاسكربت|جافا سكريبت/g, "javascript"],
  [/تايبسكريبت|تايب سكريبت/g, "typescript"],
  [/بايثون/g, "python"],
  [/بوستgres|بوستغريس|بوستجريس|بوستجرس/g, "postgres"],
  [/سيكويل|اس كيو ال/g, "sql"],
  [/دجانغو/g, "django"],
  [/لارافل/g, "laravel"],
  [/ووردبريس|وورد برس/g, "wordpress"],
  [/سيو|إس إي أو/g, "seo"],
  [/داشبورد|داش بورد/g, "dashboard"],
  [/تيفا|تي في ا/g, "tva"],
  [/سي ار ام/g, "crm"],
  [/سي ار بي/g, "erp"],
  [/ال ام اس/g, "lms"],
  [/واجهة برمجية|واجهه برمجيه/g, "api"],
  [/واتساب|وتساب/g, "whatsapp"],
  [/انستغرام|إنستغرام/g, "instagram"],
  [/فيسبوك|فايسبوك/g, "facebook"],
  [/يوتيوب/g, "youtube"],
  [/لينكدان|لينكد إن/g, "linkedin"],
  [/سترايب/g, "stripe"],
  [/بايبال|باي بال/g, "paypal"],
  [/فلاسك/g, "flask"],
  [/لينكس/g, "linux"],
];

export function expandTranslit(s: string): string {
  let out = s || "";
  for (const [re, to] of TRANSLIT) out = out.replace(re, to);
  return out;
}

function tokens(s: string): string[] {
  return norm(expandTranslit(s))
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/* ------------------------------------------------------------------- corpus */

function buildCorpus(): BrainRow[] {
  const rows: BrainRow[] = [];

  const wilayas: WilayaRow[] = WILAYAS;
  const communeCount = new Map<number, number>();
  for (const c of COMMUNES as CommuneRow[]) communeCount.set(c.w, (communeCount.get(c.w) ?? 0) + 1);

  for (const w of wilayas) {
    rows.push({
      kind: "wilaya",
      id: `w${w.code}`,
      title: `ولاية ${w.ar} (${w.fr})`,
      text: `ولاية ${w.ar} — ${w.fr}، الرمز ${String(w.code).padStart(2, "0")}، عدد البلديات ${communeCount.get(w.code) ?? "؟"}.${w.lat ? ` الإحداثيات ${w.lat.toFixed(3)}, ${w.lng?.toFixed(3)}.` : ""}`,
      source: "dataset الولايات والبلديات",
      tags: [w.ar, w.fr, `ولاية ${String(w.code).padStart(2, "0")}`, `w${w.code}`],
      meta: { code: w.code, communes: communeCount.get(w.code) ?? 0, lat: w.lat, lng: w.lng },
    });
  }

  const wilayaName = new Map(wilayas.map((w) => [w.code, w.ar]));
  for (const c of COMMUNES as CommuneRow[]) {
    rows.push({
      kind: "commune",
      id: `c${c.id}`,
      title: `بلدية ${c.ar} (${c.fr})`,
      text: `بلدية ${c.ar} (${c.fr}) — دائرة ${c.daira_ar}${c.daira_fr ? ` / ${c.daira_fr}` : ""}، ولاية ${wilayaName.get(c.w) ?? c.w}، الرمز البريدي ${c.pc}.`,
      source: "dataset الولايات والبلديات",
      tags: [c.ar, c.fr, c.pc, c.daira_ar, wilayaName.get(c.w) ?? ""],
      meta: { postcode: c.pc, wilaya: c.w },
    });
  }

  for (const u of UNIVERSITIES as UniversityRow[]) {
    rows.push({
      kind: "university",
      id: `u${norm(u.ar).slice(0, 24)}`,
      title: u.ar,
      text: `${u.ar} — ${u.cat}${u.w ? `، بولاية ${u.w}` : ""}.`,
      source: "dataset الجامعات الجزائرية",
      tags: [u.ar, u.fr, u.w, u.cat].filter(Boolean),
      meta: { wilaya: u.w, category: u.cat },
    });
  }

  for (const f of FILIERES as FiliereRow[]) {
    rows.push({
      kind: "filiere",
      id: `f${f.code}-${norm(f.ar).slice(0, 18)}`,
      title: `شعبة ${f.ar}`,
      text: `شعبة/تخصص «${f.ar}» من مجال ${f.domain} (رمز المجال ${f.code}).`,
      source: "dataset الشعب الجامعية",
      tags: [f.ar, f.domain, f.code],
      meta: { domain: f.domain, code: f.code },
    });
  }

  for (const r of RESIDENCES as ResidenceRow[]) {
    rows.push({
      kind: "residence",
      id: `r${norm(r.ar).slice(0, 22)}`,
      title: r.ar,
      text: `${r.ar}${r.w ? ` — بولاية ${r.w}` : ""} (إقامة جامعية).`,
      source: "dataset الإقامات الجامعية",
      tags: [r.ar, r.w],
      meta: { wilaya: r.w },
    });
  }

  for (const c of CURATED_ROWS as CuratedRow[]) {
    rows.push({
      kind: "fact",
      id: c.id,
      title: c.title,
      text: c.text,
      source: c.source,
      tags: [...c.tags, c.domain],
    });
  }

  return rows;
}

let CORPUS: BrainRow[] | null = null;
let INDEX: Map<string, Map<string, number>> | null = null;
let LENGTHS: number[] | null = null;
let DF: Map<string, number> | null = null;

export function brainCorpus(): BrainRow[] {
  if (!CORPUS) CORPUS = buildCorpus();
  return CORPUS;
}

function buildIndex() {
  const rows = brainCorpus();
  const index = new Map<string, Map<string, number>>();
  const lengths: number[] = [];
  const df = new Map<string, number>();
  rows.forEach((row, i) => {
    const bag = new Map<string, number>();
    const add = (s: string, weight: number) => {
      for (const t of tokens(s)) bag.set(t, (bag.get(t) ?? 0) + weight);
    };
    add(row.title, 3);
    add(row.tags.join(" "), 2.5);
    add(row.text, 1);
    index.set(String(i), bag);
    lengths[i] = Array.from(bag.values()).reduce((a, b) => a + b, 0) || 1;
    for (const t of bag.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  });
  INDEX = index;
  LENGTHS = lengths;
  DF = df;
}

const K1 = 1.4;
const B = 0.72;
const AR = /[\u0600-\u06FF]/;

/**
 * A hand-written fact answers a question far better than a name that merely
 * contains the same word, and a wilaya better than one of its communes.
 */
const PRIOR: Record<BrainRow["kind"], number> = {
  fact: 1.3,
  wilaya: 1.2,
  university: 1.1,
  filiere: 1.05,
  commune: 1,
  residence: 0.95,
};

/** BM25 over the shipped corpus, with prefix matching for partial words. */
export function searchBrain(query: string, limit = 8, kinds?: BrainRow["kind"][]): BrainHit[] {
  if (!INDEX || !LENGTHS || !DF) buildIndex();
  const rows = brainCorpus();
  const index = INDEX!;
  const lengths = LENGTHS!;
  const df = DF!;
  const q = Array.from(new Set(tokens(query)));
  if (!q.length) return [];

  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const N = rows.length;
  const scored: { i: number; score: number; matched: string[] }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (kinds && kinds.length && !kinds.includes(row.kind)) continue;
    const bag = index.get(String(i));
    if (!bag) continue;
    let score = 0;
    const matched: string[] = [];
    for (const term of q) {
      let tf = bag.get(term) ?? 0;
      let hit = term;
      /* Prefix match, carefully: a shortened query word ("بجا" → "بجاية", "yalid"
         → "Yalidine") is worth 0.7. The reverse ("فيرسل" → "فير") is not: it made
         every dataset word that happens to start like the query match, which is
         how "ننشر على فيرسل" once returned a commune called «أفير». */
      if (!tf && term.length >= (AR.test(term) ? 3 : 4)) {
        for (const [t, v] of bag) {
          if (t.startsWith(term)) {
            tf = Math.max(tf, v * 0.7);
            hit = t;
          }
        }
      }
      if (!tf) continue;
      const n = df.get(term) ?? 0.5;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * lengths[i]) / avg)));
      if (!matched.includes(hit)) matched.push(hit);
    }
    /* exact postcode / wilaya code lookups should never lose to a fuzzy match */
    const digits = query.match(/\b\d{2,5}\b/);
    if (digits) {
      const d = digits[0];
      if (row.meta && (String(row.meta.postcode ?? "") === d || String(row.meta.code ?? "") === d)) score += 6;
      else if (row.kind === "commune" && String(row.meta?.postcode ?? "").startsWith(d)) score += 2;
    }
    if (score > 0) scored.push({ i, score: score * PRIOR[row.kind], matched });
  }

  scored.sort((a, b2) => b2.score - a.score);
  return scored.slice(0, Math.max(1, limit)).map((s) => ({ row: rows[s.i], score: Math.round(s.score * 100) / 100, matched: s.matched }));
}

/**
 * The block injected into a prompt: a few retrieved rows, each on one line with
 * its source, capped by characters (a prompt is not a database dump).
 */
export function brainBrief(query: string, opts: { limit?: number; maxChars?: number } = {}): string {
  const limit = opts.limit ?? 6;
  const maxChars = opts.maxChars ?? 1500;
  const hits = searchBrain(query, limit);
  if (!hits.length) return "";
  const lines: string[] = [];
  let used = 0;
  for (const h of hits) {
    const line = `• ${h.row.text} [${h.row.source}]`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) return "";
  return `\n\n[NEXUS BRAIN — معطيات مُسترجَعة من قواعد بيانات المشروع (استعملها بدقة، ولا تختلق أرقامًا خارجها)]\n${lines.join("\n")}`;
}

/** Counts for the UI (and for a sanity check in tests). */
export function brainStats(): BrainStats {
  const rows = brainCorpus();
  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  return {
    rows: rows.length,
    byKind,
    bytes: BRAIN_BYTES,
    builtAt: BRAIN_BUILT_AT,
    sources: BRAIN_SOURCES.map((s) => ({ key: s.key, repo: s.repo, file: s.file, rows: BRAIN_ROWS[s.key] ?? 0, license: s.license })),
  };
}

export { CURATED_ROWS };
