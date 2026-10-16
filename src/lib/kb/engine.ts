/**
 * NEXUS ATLAS — محرك البحث والاسترجاع (v18)
 * ---------------------------------------------------------------------------
 * Deterministic, explainable retrieval over the built-in KB *and* over the
 * user's uploaded data vault. No embeddings, no external service: an
 * inverted-index + TF-IDF + fuzzy hybrid that runs in <5 ms, which is exactly
 * what a live chat and a live phone call need.
 *
 * Public API
 *   buildIndex(entries)          → KbIndex (cached globally)
 *   kbSearch(query, opts)        → KbHit[]
 *   kbAnswer(query, opts)        → markdown context block ready for a prompt
 *   kbNeeds(query)               → true when the KB should be consulted
 *   kbStats()                    → counters for the UI
 */
import { KB_ENTRIES, KB_CATEGORIES } from "@/lib/kb/data";
import {
  fuzzyMatch,
  makeSnippet,
  normalizeText,
  tokenize,
  uniq,
  type KbCategory,
  type KbEntry,
  type KbHit,
  type KbStats,
} from "@/lib/kb/types";

/* ═══════════════════════════════════════════════════════════════════
 *  Index
 * ═══════════════════════════════════════════════════════════════════ */

export type IndexedEntry = {
  entry: KbEntry;
  /** normalised searchable haystack (title + tags + summary + body) */
  hay: string;
  /** term → count inside the entry */
  tf: Map<string, number>;
  /** boosted terms (tags + title) — matching these is worth far more */
  strong: Set<string>;
  words: number;
};

export type KbIndex = {
  items: IndexedEntry[];
  /** term → item positions */
  inverted: Map<string, number[]>;
  /** document frequency, for IDF */
  df: Map<string, number>;
  total: number;
};

function indexEntry(entry: KbEntry): IndexedEntry {
  const titleAr = entry.title.ar;
  const titleOther = [entry.title.en, entry.title.fr].filter(Boolean).join(" ");
  const tags = entry.tags.join(" ");
  const summary =
    (entry.summary?.ar ?? "") + " " + (entry.summary?.en ?? "") + " " + (entry.summary?.fr ?? "");
  const hayRaw = `${titleAr} ${titleOther} ${tags} ${tags} ${summary} ${entry.body}`;
  const hay = normalizeText(hayRaw);
  const tf = new Map<string, number>();
  const toks = tokenize(hayRaw);
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  const strong = new Set<string>([
    ...tokenize(titleAr),
    ...tokenize(titleOther),
    ...tokenize(tags),
  ]);
  return { entry, hay, tf, strong, words: toks.length || 1 };
}

export function buildIndex(entries: KbEntry[]): KbIndex {
  const items = entries.map(indexEntry);
  const inverted = new Map<string, number[]>();
  const df = new Map<string, number>();
  items.forEach((it, i) => {
    for (const term of it.tf.keys()) {
      const list = inverted.get(term);
      if (list) list.push(i);
      else inverted.set(term, [i]);
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  });
  return { items, inverted, df, total: items.length };
}

const g = globalThis as typeof globalThis & { __atlasKbIndex?: KbIndex };

/** The built-in KB index (built once per server instance / page load). */
export function kbIndex(): KbIndex {
  if (!g.__atlasKbIndex) g.__atlasKbIndex = buildIndex(KB_ENTRIES);
  return g.__atlasKbIndex;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Search
 * ═══════════════════════════════════════════════════════════════════ */

export type KbSearchOptions = {
  limit?: number;
  category?: KbCategory | "all";
  /** search inside a custom index (e.g. the user's vault) */
  index?: KbIndex;
  /** 0..1 — how much fuzzy tolerance (typos) to allow */
  fuzziness?: number;
  /** drop hits below this score */
  minScore?: number;
};

function idf(index: KbIndex, term: string): number {
  const df = index.df.get(term) ?? 0;
  if (!df) return 0;
  return Math.log(1 + index.total / df);
}

export function kbSearch(query: string, opts: KbSearchOptions = {}): KbHit[] {
  const index = opts.index ?? kbIndex();
  const limit = Math.max(1, Math.min(40, opts.limit ?? 6));
  const fuzz = opts.fuzziness ?? 0.55;
  const minScore = opts.minScore ?? 0.12;
  const qTerms = uniq(tokenize(query));
  if (!qTerms.length) return [];

  const qNorm = normalizeText(query);
  const scores = new Map<number, { score: number; matched: string[] }>();

  const bump = (i: number, add: number, why: string) => {
    const cur = scores.get(i) ?? { score: 0, matched: [] as string[] };
    cur.score += add;
    if (!cur.matched.includes(why)) cur.matched.push(why);
    scores.set(i, cur);
  };

  /* 1) exact / fuzzy term hits through the inverted index */
  const candidates = new Set<number>();
  for (const t of qTerms) {
    for (const i of index.inverted.get(t) ?? []) candidates.add(i);
  }
  /* fuzzy: scan terms of similar length when the exact term is rare */
  if (fuzz > 0) {
    for (const t of qTerms) {
      if ((index.df.get(t) ?? 0) >= 2) continue;
      for (const term of index.df.keys()) {
        if (term.length < 4 || Math.abs(term.length - t.length) > 2) continue;
        const d = term.startsWith(t) || t.startsWith(term) ? 1 : 0;
        if (d) for (const i of index.inverted.get(term) ?? []) candidates.add(i);
        else if (editClose(t, term)) for (const i of index.inverted.get(term) ?? []) candidates.add(i);
      }
    }
  }

  for (const i of candidates) {
    const it = index.items[i];
    if (opts.category && opts.category !== "all" && it.entry.category !== opts.category) continue;

    let s = 0;
    const matched: string[] = [];
    for (const t of qTerms) {
      const c = it.tf.get(t) ?? 0;
      if (c > 0) {
        const tfScore = 1 + Math.log(c);
        const boost = it.strong.has(t) ? 2.6 : 1;
        s += tfScore * idf(index, t) * boost;
        matched.push(t);
      } else if (fuzz > 0) {
        let best = 0;
        let bestTerm = "";
        for (const term of it.strong) {
          const f = fuzzyMatch(t, term);
          if (f > best) (best = f, bestTerm = term);
        }
        if (best >= 0.6 - fuzz * 0.2) {
          s += best * idf(index, bestTerm || t) * 0.55;
          matched.push(`~${bestTerm || t}`);
        }
      }
    }
    /* 2) raw substring bonus (Arabizi, latin brands, numbers) */
    if (qNorm.length >= 3 && it.hay.includes(qNorm)) {
      s += 3.5;
      matched.push("phrase");
    }
    for (const t of qTerms) {
      if (t.length >= 4 && it.hay.includes(t)) {
        s += 1.1;
        matched.push(t);
      }
    }
    /* 3) category prior + curated reliability */
    s += (it.entry.weight ?? 50) / 220;
    s += (it.entry.reliability ?? 3) / 40;

    if (s <= 0) continue;
    bump(i, s, matched.join(", "));
  }

  const hits: KbHit[] = [];
  for (const [i, v] of scores) {
    const it = index.items[i];
    hits.push({
      entry: it.entry,
      score: v.score,
      matched: v.matched,
      snippet: makeSnippet(it.entry.body, qTerms),
    });
  }
  hits.sort((a, b) => b.score - a.score);
  const top = hits[0]?.score ?? 1;
  return hits.slice(0, limit).map((h) => ({ ...h, score: Math.min(1, h.score / Math.max(top, 4)) }));
}

function editClose(a: string, b: string): boolean {
  if (a.length < 4 || b.length < 4) return false;
  let diff = 0;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++;
  return diff <= 2 && Math.abs(a.length - b.length) <= 1;
}

/** Single best entry, or null when nothing is confident enough. */
export function kbBest(query: string, opts: KbSearchOptions = {}): KbHit | null {
  const hits = kbSearch(query, { ...opts, limit: 1, minScore: opts.minScore ?? 0.25 });
  return hits[0] ?? null;
}

/* ═══════════════════════════════════════════════════════════════════
 *  Prompt integration
 * ═══════════════════════════════════════════════════════════════════ */

/** Triggers: administrative / school / local / "how does it work" questions. */
const KB_TRIGGERS =
  /(ولاية|ولايات|بلدية|دائرة|بطاقة التعريف|جواز|باسبور|passeport|cnie|شهادة الميلاد|s12|الضمان الاجتماعي|cnas|casnos|الشفا|chifa|رخصة السياقة|بيرمي|permis|ضرائب|g50|tva|irg|jibayatic|سجل تجاري|cnrc|مقاول ذاتي|auto.?entrepreneur|باك|bac|بيام|bem|lmd|ليسانس|ماستر|جامعة|منحة|bourse|كراء|ايجار|location|عقد|contrat|حقوق المستهلك|ضمان|garantie|تاشيرة|فيزا|visa|شنغن|schengen|سفر|voyage|cv|سيرة ذاتية|مقابلة|entretien|فريلانس|freelance|دفع الكتروني|edahabia|cib|chargily|satim|برومبت|prompt|ذكاء اصطناعي|llm|تصميم|design|اولاد|اطفال|صحة|نوم|تغذية|قلق|من طورك|شكون صنعك|who (made|built) you|nexus)/i;

export function kbNeeds(query: string, index?: KbIndex): boolean {
  if (!query) return false;
  if (KB_TRIGGERS.test(query)) return true;
  const hits = kbSearch(query, { limit: 2, index, minScore: 0.3 });
  return (hits[0]?.score ?? 0) >= 0.45;
}

/**
 * Builds the markdown block injected into the system prompt.
 * Kept small on purpose: the model quotes it, it does not recite it.
 */
export function kbAnswer(query: string, opts: KbSearchOptions & { maxChars?: number } = {}): string {
  const hits = kbSearch(query, { limit: opts.limit ?? 3, index: opts.index });
  if (!hits.length) return "";
  const maxChars = opts.maxChars ?? 5200;
  const parts: string[] = ["ATLAS KNOWLEDGE (verified internal base — quote it, cite the entry id, never contradict it):"];
  let used = parts[0].length;
  for (const h of hits) {
    const body = h.entry.body.length > 1800 ? `${h.entry.body.slice(0, 1800)}…` : h.entry.body;
    const block = `\n--- [${h.entry.id}] ${h.entry.title.ar} (relevance ${(h.score * 100).toFixed(0)}%) ---\n${body}\n`;
    if (used + block.length > maxChars) break;
    parts.push(block);
    used += block.length;
  }
  parts.push(
    "\nIf the user's question is not covered above, say so plainly and fall back to live web search instead of inventing Algerian administrative details."
  );
  return parts.join("");
}

/** Human-readable summary for tool cards / activity feed. */
export function kbTitles(hits: KbHit[]): string {
  return hits.map((h) => h.entry.title.ar).join(" · ");
}

export function kbStats(index: KbIndex = kbIndex()): KbStats {
  let words = 0;
  let bytes = 0;
  const tags = new Set<string>();
  const byCategory: Record<string, number> = {};
  const languages = { ar: 0, fr: 0, en: 0 };
  for (const it of index.items) {
    words += it.words;
    bytes += it.entry.body.length + it.entry.tags.join(" ").length;
    for (const t of it.entry.tags) tags.add(normalizeText(t));
    byCategory[it.entry.category] = (byCategory[it.entry.category] ?? 0) + 1;
    if (it.entry.title.ar) languages.ar++;
    if (it.entry.title.fr) languages.fr++;
    if (it.entry.title.en) languages.en++;
  }
  return {
    entries: index.items.length,
    categories: KB_CATEGORIES.filter((c) => byCategory[c.id]).length,
    tags: tags.size,
    words,
    bytes,
    byCategory,
    languages,
  };
}

/** Category labels for the UI (client-safe). */
export const kbCategoryMeta = KB_CATEGORIES;
