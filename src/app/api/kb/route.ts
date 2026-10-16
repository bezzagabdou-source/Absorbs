import { json } from "@/lib/http";
import { KB_CATEGORIES, KB_ENTRIES, KB_VERSION, kbSelfCheck } from "@/lib/kb/data";
import { kbIndex, kbSearch, kbStats } from "@/lib/kb/engine";
import type { KbCategory } from "@/lib/kb/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * v18 ATLAS — قاعدة المعرفة المدمجة.
 *   GET /api/kb            → stats + categories (public, no auth: it is general knowledge)
 *   GET /api/kb?q=…        → search results with snippets
 *   GET /api/kb?cat=health → filter by category
 *   GET /api/kb?id=…       → one full entry
 *   GET /api/kb?all=1      → the whole base (used by the offline kit / export)
 *   GET /api/kb?check=1    → internal consistency self-check
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  const cat = (u.searchParams.get("cat") ?? "").trim();
  const id = (u.searchParams.get("id") ?? "").trim();
  const limit = Math.min(40, Math.max(1, Number(u.searchParams.get("limit") ?? 8) || 8));

  if (u.searchParams.get("check") === "1") {
    const r = kbSelfCheck();
    return json(r.ok ? 200 : 500, { ok: r.ok, problems: r.problems, entries: KB_ENTRIES.length });
  }

  if (id) {
    const entry = KB_ENTRIES.find((e) => e.id === id);
    if (!entry) return json(404, { code: "NOT_FOUND" });
    return json(200, { entry });
  }

  if (u.searchParams.get("all") === "1") {
    return json(200, { version: KB_VERSION, stats: kbStats(), categories: KB_CATEGORIES, entries: KB_ENTRIES });
  }

  if (q) {
    const known = KB_CATEGORIES.some((c) => c.id === cat);
    const hits = kbSearch(q, { limit, category: known ? (cat as KbCategory) : "all" });
    return json(200, {
      query: q,
      count: hits.length,
      hits: hits.map((h) => ({
        id: h.entry.id,
        category: h.entry.category,
        title: h.entry.title,
        summary: h.entry.summary ?? h.snippet,
        snippet: h.snippet,
        score: Number(h.score.toFixed(3)),
        matched: h.matched,
        tags: h.entry.tags.slice(0, 12),
        source: h.entry.source,
        reliability: h.entry.reliability,
      })),
    });
  }

  if (cat) {
    const entries = KB_ENTRIES.filter((e) => e.category === cat);
    return json(200, {
      category: cat,
      count: entries.length,
      entries: entries.map((e) => ({ id: e.id, title: e.title, summary: e.summary ?? e.body.slice(0, 140), tags: e.tags.slice(0, 10) })),
    });
  }

  const stats = kbStats(kbIndex());
  return json(200, { version: KB_VERSION, stats, categories: KB_CATEGORIES });
}
