/**
 * ═══════════════════════════════════════════════════════════════════════
 *  NEXUS RAG CORE — Long-Term Vector Memory engine
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Zero-dependency, isomorphic (runs on Vercel serverless Node runtimes and
 *  in tests). Everything here is pure TypeScript — persistence and embeddings
 *  are reached through plain `fetch`, so no vendor SDK ever breaks the build.
 *
 *  Layers:
 *    1. Chunking   — sentence-aware, bilingual (AR/EN/FR), overlapping windows
 *    2. Embeddings — Gemini text-embedding → OpenAI → deterministic local hash
 *    3. Stores      — Pinecone (REST) · Postgres (JSON vectors) · in-memory LRU
 *    4. Retrieval   — cosine ranking fused with Reciprocal Rank Fusion (RRF)
 *
 *  Environment (all optional — the local fallback always works):
 *    GEMINI_API_KEY / GOOGLE_API_KEY            text-embedding-004 (768d)
 *    OPENAI_API_KEY                             text-embedding-3-small (1536d)
 *    PINECONE_API_KEY + PINECONE_INDEX (+HOST)  managed vector index
 *    RAG_EMBED_PROVIDER=gemini|openai|local     force a provider
 */

/* ───────────────────────────── types ───────────────────────────── */

export type EmbeddingProvider = "gemini" | "openai" | "local";

export interface EmbeddResult {
  vectors: number[][];
  provider: EmbeddingProvider;
  /** vector dimension of this batch */
  dim: number;
}

export interface RagChunk {
  id: string;
  text: string;
  /** character offset into the source document */
  offset: number;
}

export interface VectorRecord {
  id: string;
  namespace: string;
  text: string;
  vector: number[];
  meta: Record<string, string | number | boolean>;
  /** epoch ms — used for recency boosting */
  at: number;
}

export interface RecallHit {
  id: string;
  text: string;
  /** fused relevance score (higher = more relevant) */
  score: number;
  meta: Record<string, string | number | boolean>;
  via: "vector" | "pinecone" | "local" | "keyword";
}

/* ───────────────────────────── env ───────────────────────────── */

const ENV = (n: string): string => (process.env[n] ?? "").trim();

export function ragEmbedKey(): { provider: EmbeddingProvider; key: string }[] {
  const forced = ENV("RAG_EMBED_PROVIDER").toLowerCase();
  const all: { provider: EmbeddingProvider; key: string }[] = [];
  const gk = ENV("GEMINI_API_KEY") || ENV("GOOGLE_API_KEY") || ENV("GOOGLE_GENERATIVE_AI_API_KEY");
  const ok = ENV("OPENAI_API_KEY");
  if (gk) all.push({ provider: "gemini", key: gk });
  if (ok) all.push({ provider: "openai", key: ok });
  all.push({ provider: "local", key: "" });
  if (forced === "gemini" || forced === "openai" || forced === "local") {
    return [...all.filter((p) => p.provider === forced), ...all.filter((p) => p.provider !== forced)];
  }
  return all;
}

/* ───────────────────────────── chunking ───────────────────────────── */

const SENT_END = /([.!?؟…\n]+|[،؛](?=\s|$)|:\s*\n)/;

/**
 * Sentence-aware chunker. Keeps Arabic, French and English punctuation,
 * packs sentences up to `size` chars with `overlap` chars of context carry-over.
 */
export function chunkText(source: string, size = 900, overlap = 120): RagChunk[] {
  const text = (source ?? "").replace(/\r/g, "").trim();
  if (!text) return [];
  if (text.length <= size) {
    return [{ id: chunkId(text, 0), text, offset: 0 }];
  }
  const sentences: { s: string; o: number }[] = [];
  let rest = text;
  let base = 0;
  while (rest.length) {
    const m = SENT_END.exec(rest);
    const cut = m ? m.index + m[0].length : rest.length;
    sentences.push({ s: rest.slice(0, cut), o: base });
    base += cut;
    rest = rest.slice(cut);
    if (!m && rest.length === 0) break;
    if (!m) break;
  }
  const out: RagChunk[] = [];
  let buf = "";
  let bufStart = 0;
  for (const { s, o } of sentences) {
    if (buf.length + s.length > size && buf.length > 0) {
      out.push({ id: chunkId(buf, bufStart), text: buf.trim(), offset: bufStart });
      const tail = buf.slice(Math.max(0, buf.length - overlap));
      buf = tail + s;
      bufStart = o - tail.length;
    } else {
      if (!buf) bufStart = o;
      buf += s;
    }
  }
  if (buf.trim()) out.push({ id: chunkId(buf, bufStart), text: buf.trim(), offset: Math.max(0, bufStart) });
  return out.slice(0, 200);
}

/** Small stable id: FNV-1a hash of content + offset (no crypto dependency). */
export function chunkId(text: string, offset: number): string {
  let h = 0x811c9dc5;
  const s = `${offset}:${text.length}:${text.slice(0, 256)}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `nx${h.toString(36)}${(offset % 1296).toString(36)}`;
}

/* ─────────────────────────── local embedder ─────────────────────────── */

const LOCAL_DIM = 512;

/**
 * Deterministic, language-agnostic hashing embedder: character n-grams of the
 * NORMALIZED text (diacritics stripped, Arabic presentation forms folded) are
 * hashed into a 512-d vector, L2-normalized. Zero network, zero cost — good
 * enough for fuzzy duplicate detection and fallback recall ranking.
 */
export function localEmbed(text: string, dim = LOCAL_DIM): number[] {
  const v = new Float64Array(dim);
  const norm = normalizeForEmbed(text);
  const grams = (g: number, w: number) => {
    for (let i = 0; i + g <= norm.length; i++) {
      let h = 2166136261 >>> 0;
      for (let j = 0; j < g; j++) {
        h ^= norm.charCodeAt(i + j);
        h = Math.imul(h, 16777619) >>> 0;
      }
      v[h % dim] += w;
    }
  };
  grams(3, 1);
  grams(2, 0.5);
  grams(5, 0.35);
  let s = 0;
  for (let i = 0; i < dim; i++) s += v[i] * v[i];
  const n = Math.sqrt(s) || 1;
  const out = new Array<number>(dim);
  for (let i = 0; i < dim; i++) out[i] = Math.round((v[i] / n) * 1e6) / 1e6;
  return out;
}

function normalizeForEmbed(text: string): string {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ْـ]/g, "") // Arabic diacritics + tatweel
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4096);
}

/* ─────────────────────────── remote embedders ─────────────────────────── */

async function geminiEmbed(texts: string[], key: string): Promise<number[][]> {
  const model = ENV("GEMINI_EMBED_MODEL") || "text-embedding-004";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:batchEmbedContents?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.slice(0, 100).map((t) => ({
          model: `models/${model}`,
          content: { parts: [{ text: t.slice(0, 9000) }] },
        })),
      }),
      signal: AbortSignal.timeout(25_000),
    }
  );
  if (!res.ok) throw new Error(`gemini-embed ${res.status}`);
  const j = (await res.json()) as { embeddings?: { values?: number[] }[] };
  const out = (j.embeddings ?? []).map((e) => e.values ?? []);
  if (!out.length || !out[0].length) throw new Error("gemini-embed empty");
  return out;
}

async function openAiEmbed(texts: string[], key: string): Promise<number[][]> {
  const model = ENV("OPENAI_EMBED_MODEL") || "text-embedding-3-small";
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: texts.slice(0, 100).map((t) => t.slice(0, 9000)) }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`openai-embed ${res.status}`);
  const j = (await res.json()) as { data?: { embedding?: number[] }[] };
  const out = (j.data ?? []).map((d) => d.embedding ?? []);
  if (!out.length || !out[0].length) throw new Error("openai-embed empty");
  return out;
}

/**
 * Embedding orchestrator: tries providers in env order, falls back to the
 * deterministic local embedder. Never throws.
 */
export async function embedTexts(texts: string[]): Promise<EmbeddResult> {
  const clean = texts.map((t) => (t ?? "").slice(0, 9000));
  for (const { provider, key } of ragEmbedKey()) {
    try {
      if (provider === "gemini") {
        const vectors = await geminiEmbed(clean, key);
        return { vectors, provider, dim: vectors[0].length };
      }
      if (provider === "openai") {
        const vectors = await openAiEmbed(clean, key);
        return { vectors, provider, dim: vectors[0].length };
      }
      return { vectors: clean.map((t) => localEmbed(t)), provider: "local", dim: LOCAL_DIM };
    } catch (e) {
      console.warn(`[nexus-rag] ${provider} embedding failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { vectors: clean.map((t) => localEmbed(t)), provider: "local", dim: LOCAL_DIM };
}

/* ─────────────────────────── vector math ─────────────────────────── */

export function cosine(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

/**
 * Reciprocal Rank Fusion — merges several ranked lists into one.
 * `lists` = arrays of ids ordered best-first; fused score = Σ 1/(k + rank).
 */
export function rrf(lists: string[][], k = 60): Map<string, number> {
  const score = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, rank) => {
      score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1));
    });
  }
  return score;
}

/** Recency boost: halves every ~45 days so fresh memories surface first. */
export function recencyBoost(at: number, now = Date.now()): number {
  const days = Math.max(0, (now - at) / 86_400_000);
  return Math.pow(0.5, days / 45);
}

/* ─────────────────────────── Pinecone client ─────────────────────────── */

export interface PineconeConfig {
  key: string;
  index: string;
  host: string;
  namespace: string;
}

export function pineconeConfig(): PineconeConfig | null {
  const key = ENV("PINECONE_API_KEY") || ENV("PINECONE_KEY");
  const index = ENV("PINECONE_INDEX") || ENV("PINECONE_INDEX_NAME") || "nexus-memory";
  if (!key) return null;
  return {
    key,
    index,
    host: ENV("PINECONE_INDEX_HOST").replace(/\/+$/, ""),
    namespace: ENV("PINECONE_NAMESPACE") || "facts",
  };
}

let cachedHost: { index: string; host: string; at: number } | null = null;

/** Serverless indexes don't need a static host: resolve it once per index, cache 10 min. */
export async function resolvePineconeHost(cfg: PineconeConfig): Promise<string | null> {
  if (cfg.host) return cfg.host;
  if (cachedHost && cachedHost.index === cfg.index && Date.now() - cachedHost.at < 600_000) {
    return cachedHost.host;
  }
  try {
    const res = await fetch(`https://api.pinecone.io/indexes/${encodeURIComponent(cfg.index)}`, {
      headers: { "Api-Key": cfg.key },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { host?: string };
    if (!j.host) return null;
    cachedHost = { index: cfg.index, host: `https://${j.host.replace(/^https?:\/\//, "")}`, at: Date.now() };
    return cachedHost.host;
  } catch {
    return null;
  }
}

async function pineconeFetch(cfg: PineconeConfig, path: string, body: unknown): Promise<unknown> {
  const host = await resolvePineconeHost(cfg);
  if (!host) throw new Error("pinecone-host-unresolved");
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": cfg.key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`pinecone ${res.status}`);
  return res.json();
}

export async function pineconeUpsert(records: VectorRecord[]): Promise<boolean> {
  const cfg = pineconeConfig();
  if (!cfg || !records.length) return false;
  try {
    await pineconeFetch(cfg, "/vectors/upsert", {
      vectors: records.map((r) => ({
        id: r.id,
        values: r.vector,
        metadata: { ...r.meta, text: r.text.slice(0, 35000), at: r.at },
      })),
      namespace: cfg.namespace,
    });
    return true;
  } catch (e) {
    console.warn("[nexus-rag] pinecone upsert:", e instanceof Error ? e.message : e);
    return false;
  }
}

export async function pineconeQuery(
  vector: number[],
  topK: number,
  filter?: Record<string, string>
): Promise<RecallHit[]> {
  const cfg = pineconeConfig();
  if (!cfg) return [];
  try {
    const j = (await pineconeFetch(cfg, "/query", {
      vector,
      topK,
      namespace: cfg.namespace,
      includeMetadata: true,
      ...(filter ? { filter } : {}),
    })) as { matches?: { id: string; score: number; metadata?: Record<string, unknown> }[] };
    return (j.matches ?? []).map((m) => ({
      id: m.id,
      text: String(m.metadata?.text ?? ""),
      score: m.score,
      meta: (m.metadata ?? {}) as Record<string, string | number | boolean>,
      via: "pinecone" as const,
    }));
  } catch (e) {
    console.warn("[nexus-rag] pinecone query:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function pineconeDelete(ids: string[]): Promise<boolean> {
  const cfg = pineconeConfig();
  if (!cfg || !ids.length) return false;
  try {
    const host = await resolvePineconeHost(cfg);
    if (!host) return false;
    const res = await fetch(`${host}/vectors/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Api-Key": cfg.key },
      body: JSON.stringify({ ids, namespace: cfg.namespace }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ─────────────────────── in-memory fallback store ─────────────────────── */

/**
 * Per-process LRU store (500 records). Guarantees recall works everywhere —
 * including preview environments with no external vector DB configured.
 */
const LOCAL_STORE_CAP = 500;
const localStore = new Map<string, VectorRecord>();

export function localUpsert(records: VectorRecord[]): void {
  for (const r of records) {
    localStore.set(`${r.namespace}:${r.id}`, r);
    if (localStore.size > LOCAL_STORE_CAP) {
      const oldest = localStore.keys().next().value;
      if (oldest) localStore.delete(oldest);
    }
  }
}

export function localQuery(vector: number[], namespace: string, topK: number): RecallHit[] {
  const scored: RecallHit[] = [];
  for (const r of localStore.values()) {
    if (r.namespace !== namespace) continue;
    scored.push({
      id: r.id,
      text: r.text,
      score: cosine(vector, r.vector) * (0.75 + 0.25 * recencyBoost(r.at)),
      meta: r.meta,
      via: "local",
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter((h) => h.score > 0.05);
}

/* ─────────────────────── retrieval orchestration ─────────────────────── */

/**
 * Fuses ranked hit lists from every backend that answered into one ordering
 * (RRF), applies a light recency boost, and de-duplicates by normalized text.
 */
export function fuseHits(lists: RecallHit[][], topK: number): RecallHit[] {
  const byId = new Map<string, RecallHit>();
  for (const list of lists) for (const h of list) if (!byId.has(h.id)) byId.set(h.id, h);
  const fused = rrf(lists.map((l) => l.map((h) => h.id)));
  const seenText = new Set<string>();
  const out: RecallHit[] = [];
  for (const [id, fs] of [...fused.entries()].sort((a, b) => b[1] - a[1])) {
    const h = byId.get(id);
    if (!h || !h.text) continue;
    const key = normalizeForEmbed(h.text).slice(0, 180);
    if (key && seenText.has(key)) continue;
    seenText.add(key);
    const at = typeof h.meta.at === "number" ? h.meta.at : Date.now();
    out.push({ ...h, score: fs * (0.75 + 0.25 * recencyBoost(at)) });
    if (out.length >= topK) break;
  }
  return out;
}
