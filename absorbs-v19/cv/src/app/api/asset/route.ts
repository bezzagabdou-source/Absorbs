import { json } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { assertPublic } from "@/lib/link-reader";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/asset?url=https://… — safe download proxy for generated games.
 * The sandboxed preview has no cookies and a null origin, so the host page asks this
 * route to fetch images / sounds / fonts / JSON for it (Google Fonts, gstatic, GitHub,
 * Wikimedia, any public https file). Never reaches private addresses.
 */
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 9_000;
const MAX_REDIRECTS = 3;
const OK_TYPE = /^(image\/|audio\/|font\/|application\/(json|ogg|font|x-font|octet-stream|vnd\.ms-fontobject|wasm)|text\/(plain|css|csv))/i;

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`asset:${user.uid}`, 150, 60_000).ok) return json(429, { code: "RATE" });

  const raw = new URL(req.url).searchParams.get("url") ?? "";
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return json(400, { code: "BAD_URL" });
  }
  if (target.protocol !== "https:" && target.protocol !== "http:") return json(400, { code: "BAD_URL" });

  try {
    let res: Response | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublic(target);
      res = await fetch(target, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; NexusGameAssets/1.0)", Accept: "*/*" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        target = new URL(res.headers.get("location")!, target);
        res = null;
        continue;
      }
      break;
    }
    if (!res) return json(502, { code: "TOO_MANY_REDIRECTS" });
    if (!res.ok) return json(502, { code: "UPSTREAM", status: res.status });

    const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
    if (!OK_TYPE.test(type)) return json(415, { code: "TYPE_NOT_ALLOWED", type });
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return json(413, { code: "TOO_BIG" });

    const reader = res.body?.getReader();
    if (!reader) return json(502, { code: "EMPTY" });
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BYTES) {
        reader.cancel().catch(() => undefined);
        return json(413, { code: "TOO_BIG" });
      }
      chunks.push(value);
    }
    const body = new Uint8Array(new ArrayBuffer(total));
    let off = 0;
    for (const c of chunks) {
      body.set(c, off);
      off += c.length;
    }
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(msg.includes("private") ? 403 : 502, { code: msg.includes("private") ? "BLOCKED" : "FETCH_FAILED" });
  }
}
