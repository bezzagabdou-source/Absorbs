/**
 * NEXUS ATLAS — فهرسة الخزنة (v18)
 * ---------------------------------------------------------------------------
 * Pure (browser + server + Node scripts): turns raw documents into KB-shaped
 * entries and builds the search index over them. Persistence lives in
 * `@/lib/kb/vault`; this file has zero I/O so it can run anywhere.
 */
import { buildIndex, type KbIndex } from "@/lib/kb/engine";
import { chunkLines, type KbEntry } from "@/lib/kb/types";

export type VaultSourceDoc = {
  id: string;
  name: string;
  text: string;
  origin?: string;
};

/** One entry per chunk so the engine can rank and quote at chunk level. */
export function docsToEntries(docs: VaultSourceDoc[], chunkSize = 1600, overlap = 200): KbEntry[] {
  const out: KbEntry[] = [];
  docs.forEach((d, di) => {
    const chunks = chunkLines(d.text, chunkSize, overlap);
    chunks.forEach((c, ci) => {
      out.push({
        id: `${d.id}#${ci}`,
        category: "nexus",
        title: { ar: `[D${di + 1}·${ci + 1}] ${d.name}` },
        summary: { ar: c.slice(0, 160) },
        body: c,
        tags: [d.name, `d${di + 1}`, `doc${di + 1}`, d.origin ?? "upload"],
        weight: 62,
        reliability: 4,
      });
    });
  });
  return out;
}

export function buildVaultIndex(entries: KbEntry[]): KbIndex {
  return buildIndex(entries);
}

/** Convenience: raw documents → ready index. */
export function indexVaultDocs(docs: VaultSourceDoc[]): KbIndex {
  return buildIndex(docsToEntries(docs));
}
