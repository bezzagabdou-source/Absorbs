/**
 * ═══════════════════════════════════════════════════════════════════
 *  LONG-TERM VECTOR MEMORY (RAG) — server-side API  ·  `src/lib/memory.ts`
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Wraps the zero-dependency RAG core (`nexus-rag/rag.ts`) with persistence
 *  and prompt integration:
 *
 *    • rememberFact()      embed + upsert (Pinecone → Postgres → local LRU)
 *    • semanticRecall()    vector search fused across every available backend
 *    • buildMemoryContext() formatted, budget-aware block for system prompts
 *    • distillFacts()      extracts durable user facts from a chat exchange
 *    • compactHistory()    dynamic conversation compression for long sessions
 *    • memoryEngineStatus() diagnostics (never leaks keys)
 *
 *  Storage ladder (first success wins, best effort otherwise):
 *    1. Pinecone   — when PINECONE_API_KEY (+PINECONE_INDEX) is configured
 *    2. Postgres   — `barq.ai_memory_vectors` (JSON vectors, cosine in JS;
 *                    auto-created lazily, no pgvector extension required)
 *    3. In-memory  — per-process LRU so recall never hard-fails
 */

import {
  chunkId,
  embedTexts,
  fuseHits,
  localQuery,
  localUpsert,
  pineconeConfig,
  pineconeDelete,
  pineconeQuery,
  pineconeUpsert,
  cosine,
  type RecallHit,
  type VectorRecord,
} from "../../nexus-rag/rag";
import { pool } from "@/db";

/* public re-exports — keeps every RAG primitive reachable through `@/lib/memory` */
export { embedTexts, chunkText, chunkId } from "../../nexus-rag/rag";
export type { EmbeddingProvider, RagChunk, RecallHit, VectorRecord } from "../../nexus-rag/rag";

export type MemorySource = "user" | "auto" | "chat" | "rag";

const MAX_FACT_LEN = 400;
const USER_ROW_CAP = 400; // per-user vector rows scanned on recall
const USER_STORE_CAP = 600; // per-user vector rows kept

/* ─────────────────── lazy table bootstrap ─────────────────── */

let ensured: Promise<boolean> | null = null;

/**
 * Creates the vector-mirror table once per process. Kept OUT of drizzle
 * migrations so a missing table can never break an existing deployment:
 * every operation degrades gracefully when this fails.
 */
function ensureVectorTable(): Promise<boolean> {
  if (!ensured) {
    ensured = (async () => {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS barq.ai_memory_vectors (
            id         text PRIMARY KEY,
            user_id    text NOT NULL,
            content    text NOT NULL,
            embedding  jsonb NOT NULL,
            dim        integer NOT NULL DEFAULT 0,
            provider   text NOT NULL DEFAULT 'local',
            source     text NOT NULL DEFAULT 'user',
            created_at timestamptz NOT NULL DEFAULT now()
          )`);
        await pool.query(
          `CREATE INDEX IF NOT EXISTS memvec_user_idx ON barq.ai_memory_vectors (user_id, created_at DESC)`
        );
        return true;
      } catch (e) {
        console.warn("[memory] vector table ensure:", e instanceof Error ? e.message : e);
        return false;
      }
    })();
  }
  return ensured;
}

/* ─────────────────── write path ─────────────────── */

export interface RememberResult {
  ok: boolean;
  id?: string;
  backend: "pinecone" | "pg" | "local" | "none";
}

/**
 * Stores one durable fact about a user. Embeds once, then writes to every
 * backend that is available (Pinecone for production scale, Postgres as the
 * durable mirror, local LRU as the always-on fallback).
 */
export async function rememberFact(
  userId: string,
  content: string,
  source: MemorySource = "user"
): Promise<RememberResult> {
  const text = (content ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FACT_LEN);
  if (!userId || text.length < 3) return { ok: false, backend: "none" };

  const { vectors, provider, dim } = await embedTexts([text]);
  const vector = vectors[0] ?? [];
  const record: VectorRecord = {
    id: chunkId(text, 0) + userId.slice(0, 6),
    namespace: `u:${userId}`,
    text,
    vector,
    meta: { uid: userId, source, at: Date.now(), provider },
    at: Date.now(),
  };

  let backend: RememberResult["backend"] = "none";

  if (pineconeConfig()) {
    if (await pineconeUpsert([record])) backend = "pinecone";
  }

  if (await ensureVectorTable()) {
    try {
      await pool.query(
        `INSERT INTO barq.ai_memory_vectors (id, user_id, content, embedding, dim, provider, source)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7)
         ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, embedding = EXCLUDED.embedding,
                                        provider = EXCLUDED.provider, created_at = now()`,
        [record.id, userId, text, JSON.stringify(vector), dim, provider, source]
      );
      // keep the per-user store bounded (oldest vectors fall off first)
      await pool.query(
        `DELETE FROM barq.ai_memory_vectors WHERE user_id = $1 AND id IN (
           SELECT id FROM barq.ai_memory_vectors WHERE user_id = $1
           ORDER BY created_at DESC OFFSET $2)`,
        [userId, USER_STORE_CAP]
      );
      if (backend === "none") backend = "pg";
    } catch (e) {
      console.warn("[memory] pg upsert:", e instanceof Error ? e.message : e);
    }
  }

  localUpsert([record]);
  if (backend === "none") backend = "local";
  return { ok: true, id: record.id, backend };
}

/** Removes a fact from every backend that might hold it. */
export async function forgetFact(userId: string, factText: string): Promise<void> {
  const id = chunkId((factText ?? "").trim().slice(0, MAX_FACT_LEN), 0) + userId.slice(0, 6);
  try {
    await pineconeDelete([id]);
  } catch {
    /* best effort */
  }
  try {
    if (await ensureVectorTable()) {
      await pool.query(`DELETE FROM barq.ai_memory_vectors WHERE user_id = $1 AND id = $2`, [userId, id]);
    }
  } catch {
    /* best effort */
  }
}

/* ─────────────────── read path ─────────────────── */

/** Postgres-side vector scan (bounded per user, cosine computed in JS). */
async function pgVectorQuery(userId: string, vector: number[], topK: number): Promise<RecallHit[]> {
  if (!vector.length || !(await ensureVectorTable())) return [];
  try {
    const { rows } = await pool.query<{
      id: string;
      content: string;
      embedding: number[];
      created_at: Date;
    }>(
      `SELECT id, content, embedding, created_at
         FROM barq.ai_memory_vectors WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
      [userId, USER_ROW_CAP]
    );
    return rows
      .map((r) => ({
        id: r.id,
        text: r.content,
        score: cosine(vector, Array.isArray(r.embedding) ? r.embedding : []),
        meta: { at: r.created_at instanceof Date ? r.created_at.getTime() : Date.now() },
        via: "vector" as const,
      }))
      .filter((h) => h.score > 0.12)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  } catch (e) {
    console.warn("[memory] pg query:", e instanceof Error ? e.message : e);
    return [];
  }
}

/**
 * Semantic recall: embeds the query once, asks every available backend,
 * fuses the rankings (RRF + recency boost) and returns the top matches.
 */
export async function semanticRecall(userId: string, query: string, topK = 6): Promise<RecallHit[]> {
  const q = (query ?? "").trim();
  if (!userId || q.length < 2 || topK <= 0) return [];
  const { vectors } = await embedTexts([q.slice(0, 4000)]);
  const qv = vectors[0] ?? [];
  const lists: RecallHit[][] = [];
  lists.push(await pineconeQuery(qv, topK, { uid: userId }));
  lists.push(await pgVectorQuery(userId, qv, topK));
  lists.push(localQuery(qv, `u:${userId}`, topK));
  return fuseHits(lists, topK);
}

/**
 * Builds the prompt block injected before generation. Budget-aware: keeps
 * the strongest matches that fit, silently returns "" when nothing is relevant
 * so the caller's prompt never changes shape for users without memories.
 */
export async function buildMemoryContext(
  userId: string,
  query: string,
  { topK = 5, budget = 1400 }: { topK?: number; budget?: number } = {}
): Promise<string> {
  try {
    const hits = await semanticRecall(userId, query, topK);
    if (!hits.length) return "";
    const lines: string[] = [];
    let used = 0;
    for (const h of hits) {
      const line = `- ${h.text}`;
      if (used + line.length > budget) break;
      used += line.length;
      lines.push(line);
    }
    if (!lines.length) return "";
    return (
      "\n\nRETRIEVED USER MEMORY (semantically relevant facts from earlier sessions — " +
      "use them naturally when they help, never mention you retrieved them):\n" +
      lines.join("\n")
    );
  } catch (e) {
    console.warn("[memory] context:", e instanceof Error ? e.message : e);
    return "";
  }
}

/* ─────────────── dynamic fact distillation ─────────────── */

/**
 * Pulls durable user facts out of one exchange (bilingual patterns: Darija /
 * Arabic / French / English). Passive: never asks the user anything.
 */
const FACT_PATTERNS: RegExp[] = [
  /(?:^|[\s.!؟،,])(?:اسمي|ني اسم|سماني|انا اسمي?)\s+(.{2,60})/i,
  /(?:^|[\s.!؟،,])(?:أنا طالب|أنا أستاذ|نخدم|أعمل كـ?|خدمتي|وظيفتي)\s*(.{2,80})/i,
  /(?:^|[\s.!؟،,])(?:نسكن في|أسكن في|أعيش في|راني في|من ولاية)\s+(.{2,60})/i,
  /(?:^|[\s.!؟،,])(?:نحب|نبغي|أحب|أفضّل|ما نحبش|نكره)\s+(.{3,80})/i,
  /(?:^|[\s.!؟،,])(?:مشروعي|نشتغل على|خدم على)\s+(.{3,100})/i,
  /\b(?:my name is|i am|i'm)\s+([a-z][a-z '\-]{1,60})/i,
  /\b(?:i work as|i live in|i study|my project is)\s+([^.,!?\n]{2,100})/i,
  /\b(?:i (?:like|love|prefer|hate))\s+([^.,!?\n]{3,80})/i,
  /(?:^|[\s.!؟،,])(?:je m'appelle|j'habite à|je travaille comme|je préfère)\s+([^.,!?\n]{2,80})/i,
];

export function distillFacts(userText: string): string[] {
  const t = (userText ?? "").slice(0, 4000);
  const out = new Set<string>();
  for (const re of FACT_PATTERNS) {
    const m = re.exec(t);
    if (!m) continue;
    const fact = (m[0] ?? "").trim().replace(/\s+/g, " ").slice(2, MAX_FACT_LEN).trim();
    if (fact.length >= 6 && fact.length <= MAX_FACT_LEN) out.add(fact);
  }
  return [...out].slice(0, 4);
}

/**
 * Best-effort automatic memory: distills facts from the user's message and
 * stores them. Runs detached (fire-and-forget) so it never delays a reply.
 */
export function autoDistillAndStore(userId: string, userText: string): void {
  try {
    const facts = distillFacts(userText);
    if (!facts.length) return;
    void (async () => {
      for (const f of facts) await rememberFact(userId, f, "auto");
    })().catch(() => undefined);
  } catch {
    /* memory is best-effort */
  }
}

/* ─────────────── dynamic history compaction ─────────────── */

export type CompactTurn = { role: "user" | "model"; text: string };

/**
 * Keeps the RECENT turns verbatim and compresses everything older into a
 * short rolling summary, so very long sessions keep full fidelity where it
 * matters (the tail) without blowing the context budget. Extractive and
 * deterministic — no extra LLM call, so it's free and instant.
 */
export function compactHistory(
  turns: CompactTurn[],
  { budgetChars = 24_000, keepTailTurns = 10, summaryBudget = 1_600 }: {
    budgetChars?: number;
    keepTailTurns?: number;
    summaryBudget?: number;
  } = {}
): CompactTurn[] {
  const clean = turns.filter((t) => t && typeof t.text === "string");
  const total = clean.reduce((n, t) => n + t.text.length, 0);
  if (total <= budgetChars || clean.length <= keepTailTurns) return clean;

  const tail = clean.slice(-keepTailTurns);
  const head = clean.slice(0, -keepTailTurns);

  const bullets: string[] = [];
  let used = 0;
  for (const t of head) {
    const first = t.text.split(/[.!؟\n]/)[0]?.trim() ?? "";
    if (!first) continue;
    const line = `- ${t.role === "user" ? "المستخدم" : "المساعد"}: ${first.slice(0, 140)}`;
    if (used + line.length > summaryBudget) break;
    used += line.length;
    bullets.push(line);
  }

  const summary: CompactTurn = {
    role: "model",
    text:
      "[ملخص تلقائي لبداية هذه المحادثة الطويلة — التفاصيل الأخيرة محفوظة كاملة أدناه]\n" +
      (bullets.length ? bullets.join("\n") : "- تبادل أطراف الحديث أسئلة وأجوبة سابقة."),
  };
  return [summary, ...tail];
}

/* ─────────────────── diagnostics ─────────────────── */

export function memoryEngineStatus(): {
  pinecone: boolean;
  postgres: boolean;
  embedProvider: string;
  index: string | null;
} {
  const pc = pineconeConfig();
  return {
    pinecone: Boolean(pc),
    postgres: Boolean(ensured !== null),
    embedProvider: (process.env.RAG_EMBED_PROVIDER ?? "auto").trim() || "auto",
    index: pc ? pc.index : null,
  };
}
