import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";
import { pool } from "@/db";
import { findMedia, attributionLine, type MediaKind } from "@/lib/net/media";
import { netFetch } from "@/lib/net/fetch";
import { vaultAdd } from "@/lib/kb/vault";
import { invalidateVault } from "@/lib/atlas-context";
import { getProfile } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * v18 ATLAS — البحث في الإنترنت عن وسائط حرة وتنزيلها.
 *   GET  /api/internet/media?q=…&kind=image|audio|data|document&limit=8
 *   POST /api/internet/media { url, name?, kind?, save?:true, mime? }
 *        → ينزّل الملف ويعيده (dataUrl للمعاينة) ويحفظه في الخزنة عند الطلب.
 */

const KINDS: MediaKind[] = ["image", "audio", "data", "document"];

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  if (!q) return json(400, { code: "MISSING_QUERY" });
  if (!rateLimit(`media:${user.uid}`, 40, 60_000).ok) return json(429, { code: "RATE" });

  const kindRaw = (u.searchParams.get("kind") ?? "image") as MediaKind;
  const kind: MediaKind = KINDS.includes(kindRaw) ? kindRaw : "image";
  const limit = Math.min(24, Math.max(1, Number(u.searchParams.get("limit") ?? 10) || 10));

  try {
    const found = await findMedia({ query: q, kind, limit });
    return json(200, {
      query: q,
      kind,
      count: found.length,
      results: found.map((a) => ({ ...a, attribution: a.attribution ?? attributionLine(a) })),
      providers: {
        openverse: true,
        commons: true,
        archive: true,
        pixabay: !!process.env.PIXABAY_KEY,
        pexels: !!process.env.PEXELS_API_KEY,
        freesound: !!process.env.FREESOUND_TOKEN,
      },
    });
  } catch (e) {
    return serverError("media:search", e);
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`media:${user.uid}`, 40, 60_000).ok) return json(429, { code: "RATE" });

  let body: { url?: unknown; name?: unknown; kind?: unknown; save?: unknown; mime?: unknown; text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\//i.test(url)) return json(400, { code: "MISSING_URL" });

  let pro = false;
  try {
    pro = (await getProfile(user.uid))?.plan === "pro";
  } catch {
    pro = false;
  }
  const maxBytes = pro ? 40_000_000 : 12_000_000;

  try {
    const kind = typeof body.kind === "string" && KINDS.includes(body.kind as MediaKind) ? (body.kind as MediaKind) : "image";
    const res = await netFetch(url, { maxBytes, inline: true, textChars: 80_000 });
    if (!res.ok) return json(502, { code: "FETCH_FAILED", detail: res.error ?? `HTTP ${res.status}` });

    const filename = (typeof body.name === "string" && body.name.trim() ? body.name.trim() : decodeURIComponent(new URL(url).pathname.split("/").pop() || "asset")).slice(0, 180);
    const out: Record<string, unknown> = {
      ok: true,
      url,
      filename,
      kind: res.kind,
      mime: res.mime,
      bytes: res.bytes,
      ms: res.ms,
      text: res.text.slice(0, 20_000),
      dataUrl: res.dataUrl,
      entries: res.entries?.slice(0, 60),
    };

    if (body.save === true || body.save === "true") {
      await ensureSchema();
      const stored = res.text.trim()
        ? await vaultAdd(user.uid, { name: filename, text: res.text, origin: "agent", source: url }, pool)
        : null;
      if (stored) {
        invalidateVault(user.uid);
        out.saved = { id: stored.id, name: stored.name, bytes: stored.bytes };
      } else {
        out.saved = null;
        out.saveNote = res.dataUrl
          ? "الملف وسائط (صورة/صوت): تم تنزيله وإعادته للمعاينة. لحفظه كمرجع دائم استعمل زر التنزيل."
          : "ما فيهش نص يُحفظ في الخزنة.";
      }
    }
    return json(200, out);
  } catch (e) {
    return serverError("media:download", e);
  }
}
