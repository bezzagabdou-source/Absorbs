import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { embedTexts, memoryEngineStatus, rememberFact, semanticRecall } from "@/lib/memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY = 4000;

/**
 * GET → vector-memory engine diagnostics (which backends are live; no secrets).
 * POST { query, k? }  → semantic recall for the authenticated user.
 * POST { save, source? } → store one fact (embedded + mirrored everywhere).
 */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  return json(200, { status: memoryEngineStatus() });
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`memrec:${user.uid}`, 30, 60_000).ok) return json(429, { code: "RATE" });

  let body: { query?: unknown; k?: unknown; save?: unknown; source?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  try {
    /* write path */
    if (typeof body.save === "string" && body.save.trim().length >= 3) {
      const source =
        body.source === "auto" || body.source === "chat" || body.source === "rag" ? body.source : "user";
      const { vectors, provider, dim } = await embedTexts([body.save.trim().slice(0, MAX_QUERY)]);
      const out = await rememberFact(user.uid, body.save, source);
      return json(200, { ok: out.ok, id: out.id, backend: out.backend, provider, dim, embedded: vectors.length });
    }

    /* recall path */
    const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY) : "";
    if (query.length < 2) return json(400, { code: "BAD_QUERY" });
    const k = typeof body.k === "number" && Number.isFinite(body.k) ? Math.min(12, Math.max(1, Math.floor(body.k))) : 6;
    const started = Date.now();
    const hits = await semanticRecall(user.uid, query, k);
    return json(200, {
      hits: hits.map((h) => ({ id: h.id, text: h.text, score: Math.round(h.score * 1000) / 1000, via: h.via })),
      ms: Date.now() - started,
      backend: memoryEngineStatus(),
    });
  } catch (e) {
    return serverError("memory:recall", e, "RAG");
  }
}
