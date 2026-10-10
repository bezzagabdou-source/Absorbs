import { json } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { getGeminiKey } from "@/lib/gemini";
import { VEO_FILE_PREFIX } from "@/lib/video-gen";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Veo files need the API key, so the browser can't open them directly: stream them through here (signed-in users only). */
export async function GET(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const uri = new URL(req.url).searchParams.get("uri") ?? "";
  if (!uri.startsWith(VEO_FILE_PREFIX) || uri.length > 600) return json(400, { code: "BAD_URI" });
  const key = getGeminiKey();
  if (!key) return json(503, { code: "NO_PROVIDER" });

  const up = await fetch(uri, { headers: { "x-goog-api-key": key }, redirect: "follow", cache: "no-store" }).catch(() => null);
  if (!up || !up.ok || !up.body) return json(502, { code: "FAILED" });
  return new Response(up.body, {
    headers: { "Content-Type": up.headers.get("content-type") ?? "video/mp4", "Cache-Control": "private, no-store" },
  });
}
