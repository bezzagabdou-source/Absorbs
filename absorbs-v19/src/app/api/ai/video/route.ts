import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { getProfile } from "@/lib/usage";
import {
  availableVideoProviders,
  checkVideo,
  isVideoAspect,
  isVideoChoice,
  pickProvider,
  startVideo,
  VEO_OP_RE,
  REPLICATE_ID_RE,
  VIDEO_PROMPT_MAX,
  VideoError,
  type VideoProvider,
} from "@/lib/video-gen";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** POST = start a job (returns at once). GET = poll it. Neither request waits for the render. */
export async function POST(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: { prompt?: unknown; aspect?: unknown; seconds?: unknown; provider?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, VIDEO_PROMPT_MAX) : "";
  if (prompt.length < 5) return json(400, { code: "MISSING_FIELD" });
  const aspect = isVideoAspect(body.aspect) ? body.aspect : "16:9";
  const seconds = body.seconds === 10 ? 10 : 5;
  const choice = isVideoChoice(body.provider) ? body.provider : "auto";

  const prof = await getProfile(user.uid).catch(() => null);
  // v10: open to free accounts, with a much tighter limit (video renders cost real money)
  const pro = prof?.plan === "pro";
  const rl = pro ? rateLimit(`vid:${user.uid}`, 4, 60_000) : rateLimit(`vidf:${user.uid}`, 1, 180_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  try {
    const provider = pickProvider(choice);
    const job = await startVideo({ provider, prompt, aspect, seconds });
    return json(200, { job });
  } catch (e) {
    if (e instanceof VideoError) {
      const status = e.code === "BLOCKED" ? 422 : e.code === "NO_PROVIDER" ? 503 : 502;
      return json(status, { code: e.code });
    }
    console.error("[video:start]", e);
    return json(500, { code: "ERROR" });
  }
}

export async function GET(req: Request): Promise<Response> {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const url = new URL(req.url);
  if (url.searchParams.get("providers") === "1") return json(200, { providers: availableVideoProviders() });

  const provider = url.searchParams.get("provider");
  const id = url.searchParams.get("id") ?? "";
  if (provider !== "replicate" && provider !== "gemini") return json(400, { code: "BAD_JOB" });
  const ok = provider === "replicate" ? REPLICATE_ID_RE.test(id) : VEO_OP_RE.test(id);
  if (!ok) return json(400, { code: "BAD_JOB" });

  const rl = rateLimit(`vidpoll:${user.uid}`, 90, 60_000);
  if (!rl.ok) return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });

  try {
    const status = await checkVideo(provider as VideoProvider, id);
    return json(200, { status });
  } catch (e) {
    console.error("[video:poll]", e);
    return json(200, { status: { state: "running" } }); // transient network error: keep polling
  }
}
