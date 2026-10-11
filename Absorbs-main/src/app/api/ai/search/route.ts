import { json } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { readPage, webSearch } from "@/lib/web-search";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { q?: string; url?: string } — live internet access for the assistant / UI. */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`web:${user.uid}`, 20, 60_000).ok) return json(429, { code: "RATE" });

  let body: { q?: unknown; url?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }

  const url = typeof body.url === "string" && /^https?:\/\//.test(body.url) ? body.url : "";
  const q = typeof body.q === "string" ? body.q.trim().slice(0, 300) : "";
  if (!url && !q) return json(400, { code: "BAD_INPUT" });

  try {
    if (url) return json(200, { url, text: await readPage(url, 8000) });
    const results = await webSearch(q, 6);
    return json(200, { q, results });
  } catch (e) {
    console.error("[search]", String(e).slice(0, 160));
    return json(200, { q, results: [], text: "" });
  }
}
