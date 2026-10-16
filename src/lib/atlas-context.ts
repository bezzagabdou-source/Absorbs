/**
 * NEXUS ATLAS — حقن السياق (v18)
 * ---------------------------------------------------------------------------
 * One function the chat / voice / agent routes call to get the ATLAS layer:
 *   constitution (identity + thinking + capabilities + safety)
 * + the relevant ATLAS knowledge-base entries
 * + the relevant chunks of the user's own data vault
 *
 * Everything is deterministic and cheap (<10 ms) so it never delays the first
 * token of a live answer — including in a phone call.
 */
import { pool } from "@/db";
import { ATLAS_CONSTITUTION, ATLAS_CONSTITUTION_LITE } from "@/lib/atlas-constitution";
import { kbAnswer, kbNeeds, kbSearch } from "@/lib/kb/engine";
import { docsToEntries, buildVaultIndex } from "@/lib/kb/vault-index";
import type { KbIndex } from "@/lib/kb/engine";

export type AtlasContextOptions = {
  /** last user message */
  query: string;
  userId?: string;
  /** voice calls get the lite constitution (latency + short turns) */
  voice?: boolean;
  /** consult the built-in knowledge base (default: automatic detection) */
  kb?: boolean;
  /** consult the user's uploaded data vault (default true) */
  vault?: boolean;
  /** extra text appended (e.g. downloaded-file reports) */
  extra?: string;
  maxKbChars?: number;
  maxVaultChars?: number;
};

export type AtlasContext = {
  block: string;
  kb: { ids: string[]; titles: string[] };
  vault: { docs: number; chunks: number; refs: string[] };
};

const empty: AtlasContext = { block: "", kb: { ids: [], titles: [] }, vault: { docs: 0, chunks: 0, refs: [] } };

/** Loads (and caches for 60 s) the user's vault documents from Postgres. */
const vaultCache = new Map<string, { at: number; index: KbIndex | null; docs: number }>();

async function loadVaultIndex(userId: string): Promise<{ index: KbIndex | null; docs: number }> {
  const hit = vaultCache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return { index: hit.index, docs: hit.docs };
  try {
    const r = await pool.query<{ id: string; name: string; text: string; origin: string }>(
      `select id, name, origin, left(text, 200000) as text from barq.atlas_docs
        where user_id = $1 order by created_at desc limit 40`,
      [userId]
    );
    const docs = (r.rows ?? []).map((row) => ({ id: row.id, name: row.name, text: row.text ?? "", origin: row.origin }));
    const index = docs.length ? docsToEntries(docs) : null;
    const built: KbIndex | null = index ? buildVaultIndex(index) : null;
    vaultCache.set(userId, { at: Date.now(), index: built, docs: docs.length });
    return { index: built, docs: docs.length };
  } catch {
    vaultCache.set(userId, { at: Date.now(), index: null, docs: 0 });
    return { index: null, docs: 0 };
  }
}

/** Call after a vault change so the next message sees the new documents. */
export function invalidateVault(userId: string): void {
  vaultCache.delete(userId);
}

export async function buildAtlasContext(o: AtlasContextOptions): Promise<AtlasContext> {
  const query = (o.query ?? "").slice(0, 4000);
  if (!query.trim()) return empty;

  const parts: string[] = [];
  const kbIds: string[] = [];
  const kbTitles: string[] = [];
  let vaultDocs = 0;
  let vaultChunks = 0;
  const vaultRefs: string[] = [];

  /* 1 — constitution (identity + strict thinking protocol) */
  parts.push(o.voice ? ATLAS_CONSTITUTION_LITE : ATLAS_CONSTITUTION);

  /* 2 — built-in knowledge base */
  const useKb = o.kb ?? kbNeeds(query);
  if (useKb) {
    const hits = kbSearch(query, { limit: 3, minScore: 0.18 });
    if (hits.length) {
      const block = kbAnswer(query, { limit: 3, maxChars: o.maxKbChars ?? (o.voice ? 1200 : 5200) });
      if (block) {
        parts.push(block);
        for (const h of hits) {
          kbIds.push(h.entry.id);
          kbTitles.push(h.entry.title.ar);
        }
      }
    }
  }

  /* 3 — the user's own data vault */
  if (o.vault !== false && o.userId) {
    const { index, docs } = await loadVaultIndex(o.userId);
    vaultDocs = docs;
    if (index) {
      const hits = kbSearch(query, { index, limit: o.voice ? 2 : 8, minScore: 0.08 });
      if (hits.length) {
        const budget = o.maxVaultChars ?? (o.voice ? 1200 : 9000);
        const chunks: string[] = [
          "USER DATA VAULT (the user's own uploaded/downloaded files — this is the authoritative source for their data; quote it with its [D#·#] reference):",
        ];
        let used = 0;
        for (const h of hits) {
          const text = h.entry.body.trim();
          if (!text || used + text.length > budget) continue;
          used += text.length;
          chunks.push(`${h.entry.title.ar}\n${text}`);
          vaultRefs.push(h.entry.title.ar);
          vaultChunks++;
        }
        if (vaultChunks) parts.push(chunks.join("\n\n"));
      }
    }
  }

  if (o.extra) parts.push(o.extra);

  return { block: parts.filter(Boolean).join("\n"), kb: { ids: kbIds, titles: kbTitles }, vault: { docs: vaultDocs, chunks: vaultChunks, refs: vaultRefs } };
}
