import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { netFetch, urlsIn, wantedAssetKind } from "@/lib/net/fetch";
import { getProfile } from "@/lib/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * v18 ATLAS — عين التطبيق على الإنترنت.
 *   POST /api/internet/fetch  { url | text, maxBytes?, inline?, textChars? }
 *   GET  /api/internet/fetch?url=…
 *
 * يقرأ أي رابط عام بأمان (حماية SSRF، حدود حجم ووقت) ويعيد:
 * النوع · العنوان · النص المقروء · شكل JSON/CSV · قائمة محتويات الأرشيف ·
 * أو data URL للصور والأصوات الصغيرة.
 */

const MAX_INLINE = 4_000_000;

async function caps(uid: string): Promise<{ maxBytes: number; inline: boolean }> {
  let pro = false;
  try {
    pro = (await getProfile(uid))?.plan === "pro";
  } catch {
    pro = false;
  }
  return { maxBytes: pro ? 40_000_000 : 12_000_000, inline: true };
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`net:${user.uid}`, 60, 60_000).ok) return json(429, { code: "RATE" });

  let body: { url?: unknown; text?: unknown; maxBytes?: unknown; inline?: unknown; textChars?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_JSON" });
  }

  const url = typeof body.url === "string" ? body.url.trim() : urlsIn(typeof body.text === "string" ? body.text : "", 1)[0] ?? "";
  if (!url) return json(400, { code: "MISSING_URL" });

  try {
    const c = await caps(user.uid);
    const maxBytes = Math.min(c.maxBytes, Number(body.maxBytes) || c.maxBytes);
    const res = await netFetch(url, {
      maxBytes,
      inline: body.inline === false ? false : c.inline,
      textChars: Math.min(200_000, Number(body.textChars) || 60_000),
    });
    const payload: Record<string, unknown> = {
      ok: res.ok,
      url: res.url,
      finalUrl: res.finalUrl,
      status: res.status,
      kind: res.kind,
      mime: res.mime,
      bytes: res.bytes,
      ms: res.ms,
      title: res.title,
      shape: res.shape,
      text: res.text.slice(0, 60_000),
      entries: res.entries?.slice(0, 80),
      error: res.error,
      suggested: wantedAssetKind(res.title ? `${res.title} ${url}` : url),
      inlineLimit: MAX_INLINE,
    };
    if (res.dataUrl && res.dataUrl.length <= MAX_INLINE * 1.4) payload.dataUrl = res.dataUrl;
    return json(res.ok ? 200 : 502, payload);
  } catch (e) {
    return serverError("internet:fetch", e);
  }
}

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!url) return json(400, { code: "MISSING_URL" });
  if (!rateLimit(`net:${user.uid}`, 60, 60_000).ok) return json(429, { code: "RATE" });
  try {
    const c = await caps(user.uid);
    const res = await netFetch(url, { maxBytes: c.maxBytes, textChars: 20_000 });
    return json(res.ok ? 200 : 502, {
      ok: res.ok,
      kind: res.kind,
      mime: res.mime,
      bytes: res.bytes,
      title: res.title,
      text: res.text.slice(0, 8000),
      error: res.error,
    });
  } catch (e) {
    return serverError("internet:get", e);
  }
}
