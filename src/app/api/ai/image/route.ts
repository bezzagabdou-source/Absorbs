import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile } from "@/lib/usage";
import { generateImage, ImageError } from "@/lib/image-gen";
import {
  IMAGE_PROMPT_MAX,
  IMAGE_REF_MAX_BYTES,
  IMAGE_REF_MIMES,
  isImageAspect,
  isImageStyle,
  isImageTier,
  type ImageAspect,
  type ImageReference,
  type ImageStyle,
  type ImageTier,
} from "@/lib/image-types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** One request = one image (the client runs the variants in parallel), so every response stays well under the 4.5 MB limit. */
export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: { prompt?: unknown; tier?: unknown; aspect?: unknown; style?: unknown; reference?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, IMAGE_PROMPT_MAX) : "";
  if (prompt.length < 3) return json(400, { code: "MISSING_FIELD" });
  const tier: ImageTier = isImageTier(body.tier) ? body.tier : "v5";
  const aspect: ImageAspect = isImageAspect(body.aspect) ? body.aspect : "1:1";
  const style: ImageStyle = isImageStyle(body.style) ? body.style : "photo";

  let reference: ImageReference | undefined;
  if (body.reference && typeof body.reference === "object") {
    const r = body.reference as { mime?: unknown; data?: unknown };
    const okMime = typeof r.mime === "string" && (IMAGE_REF_MIMES as readonly string[]).includes(r.mime);
    if (!okMime || typeof r.data !== "string" || r.data.length < 100 || r.data.length > IMAGE_REF_MAX_BYTES || !/^[A-Za-z0-9+/=]+$/.test(r.data)) {
      return json(400, { code: "BAD_REFERENCE" });
    }
    reference = { mime: r.mime as string, data: r.data };
  }

  const prof = await getProfile(user.uid).catch(() => null);
  if (prof?.plan !== "pro") return json(403, { code: "PRO_ONLY" });

  const rl = rateLimit(`img:${user.uid}`, 24, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  try {
    const image = await generateImage({ prompt, tier, aspect, style, reference });
    return json(200, { image });
  } catch (e) {
    if (e instanceof ImageError) {
      const status = e.code === "BLOCKED" ? 422 : e.code === "NO_PROVIDER" ? 503 : 502;
      return json(status, { code: e.code });
    }
    console.error("[image]", e);
    return json(500, { code: "ERROR" });
  }
}
