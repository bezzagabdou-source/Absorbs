/**
 * Video generation — SERVER SIDE ONLY.
 * Two real engines, both asynchronous (start a job, then poll):
 *   - Replicate  (REPLICATE_API_TOKEN, model via REPLICATE_VIDEO_MODEL, default bytedance/seedance-1-lite)
 *   - Gemini Veo (GEMINI_API_KEY, model via GEMINI_VIDEO_MODEL, default veo-3.0-fast-generate-001)
 * A job is stateless: the client keeps {provider, id} and polls /api/ai/video.
 */
import { getGeminiKey } from "@/lib/gemini";

export type VideoAspect = "16:9" | "9:16" | "1:1";
export const VIDEO_ASPECTS: readonly VideoAspect[] = ["16:9", "9:16", "1:1"];
export type VideoProvider = "replicate" | "gemini";
export type VideoChoice = "auto" | VideoProvider;
export const VIDEO_PROMPT_MAX = 1200;

export function isVideoAspect(v: unknown): v is VideoAspect {
  return typeof v === "string" && (VIDEO_ASPECTS as readonly string[]).includes(v);
}
export function isVideoChoice(v: unknown): v is VideoChoice {
  return v === "auto" || v === "replicate" || v === "gemini";
}

export type VideoStatus =
  | { state: "running" }
  | { state: "done"; url: string; /** true → the URL needs the user's auth header (fetch it as a blob) */ needsAuth: boolean }
  | { state: "failed"; code: "BLOCKED" | "FAILED" };

export class VideoError extends Error {
  code: "NO_PROVIDER" | "BLOCKED" | "FAILED";
  constructor(code: "NO_PROVIDER" | "BLOCKED" | "FAILED", message?: string) {
    super(message ?? code);
    this.name = "VideoError";
    this.code = code;
  }
}

const REPLICATE = "https://api.replicate.com/v1";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

function replicateToken(): string {
  return (process.env.REPLICATE_API_TOKEN ?? "").trim();
}
function replicateModel(): string {
  return (process.env.REPLICATE_VIDEO_MODEL ?? "bytedance/seedance-1-lite").trim();
}
function veoModel(): string {
  return (process.env.GEMINI_VIDEO_MODEL ?? "veo-3.0-fast-generate-001").trim();
}

export function availableVideoProviders(): VideoProvider[] {
  const out: VideoProvider[] = [];
  if (replicateToken()) out.push("replicate");
  if (getGeminiKey()) out.push("gemini");
  return out;
}

export function pickProvider(choice: VideoChoice): VideoProvider {
  const have = availableVideoProviders();
  if (choice !== "auto") {
    if (!have.includes(choice)) throw new VideoError("NO_PROVIDER");
    return choice;
  }
  if (have.length === 0) throw new VideoError("NO_PROVIDER");
  return have[0];
}

function looksBlocked(text: string): boolean {
  return /nsfw|safety|blocked|policy|sensitive|prohibited|violat/i.test(text);
}

export async function startVideo(o: {
  provider: VideoProvider;
  prompt: string;
  aspect: VideoAspect;
  seconds: 5 | 10;
}): Promise<{ provider: VideoProvider; id: string }> {
  if (o.provider === "replicate") {
    const res = await fetch(`${REPLICATE}/models/${replicateModel()}/predictions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${replicateToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { prompt: o.prompt, aspect_ratio: o.aspect, duration: o.seconds } }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; detail?: string };
    if (!res.ok || !body.id) {
      if (looksBlocked(String(body.detail ?? ""))) throw new VideoError("BLOCKED");
      throw new VideoError("FAILED", `replicate ${res.status}`);
    }
    return { provider: "replicate", id: body.id };
  }

  // Gemini Veo supports 16:9 and 9:16 only — square falls back to 16:9
  const aspectRatio = o.aspect === "9:16" ? "9:16" : "16:9";
  const key = getGeminiKey();
  if (!key) throw new VideoError("NO_PROVIDER");
  const res = await fetch(`${GEMINI}/models/${veoModel()}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt: o.prompt }], parameters: { aspectRatio } }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await res.json().catch(() => ({}))) as { name?: string; error?: { message?: string } };
  if (!res.ok || !body.name) {
    if (looksBlocked(String(body.error?.message ?? ""))) throw new VideoError("BLOCKED");
    throw new VideoError("FAILED", `veo ${res.status}`);
  }
  return { provider: "gemini", id: body.name };
}

/** Veo operation names look like models/<model>/operations/<id> — anything else is rejected (no SSRF). */
export const VEO_OP_RE = /^models\/[\w.-]+\/operations\/[\w-]+$/;
export const REPLICATE_ID_RE = /^[a-z0-9]{8,40}$/i;
export const VEO_FILE_PREFIX = "https://generativelanguage.googleapis.com/";

export async function checkVideo(provider: VideoProvider, id: string): Promise<VideoStatus> {
  if (provider === "replicate") {
    if (!REPLICATE_ID_RE.test(id)) return { state: "failed", code: "FAILED" };
    const res = await fetch(`${REPLICATE}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${replicateToken()}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { state: "failed", code: "FAILED" };
    const d = (await res.json()) as { status?: string; output?: unknown; error?: unknown };
    if (d.status === "succeeded") {
      const out = Array.isArray(d.output) ? d.output[0] : d.output;
      if (typeof out === "string" && out.startsWith("https://")) return { state: "done", url: out, needsAuth: false };
      return { state: "failed", code: "FAILED" };
    }
    if (d.status === "failed" || d.status === "canceled") {
      return { state: "failed", code: looksBlocked(String(d.error ?? "")) ? "BLOCKED" : "FAILED" };
    }
    return { state: "running" };
  }

  if (!VEO_OP_RE.test(id)) return { state: "failed", code: "FAILED" };
  const key = getGeminiKey();
  if (!key) return { state: "failed", code: "FAILED" };
  const res = await fetch(`${GEMINI}/${id}`, {
    headers: { "x-goog-api-key": key },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return { state: "failed", code: "FAILED" };
  const d = (await res.json()) as {
    done?: boolean;
    error?: { message?: string };
    response?: {
      generateVideoResponse?: {
        generatedSamples?: { video?: { uri?: string } }[];
        raiMediaFilteredCount?: number;
      };
    };
  };
  if (!d.done) return { state: "running" };
  if (d.error) return { state: "failed", code: looksBlocked(String(d.error.message ?? "")) ? "BLOCKED" : "FAILED" };
  const uri = d.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const filtered = (d.response?.generateVideoResponse?.raiMediaFilteredCount ?? 0) > 0;
    return { state: "failed", code: filtered ? "BLOCKED" : "FAILED" };
  }
  return { state: "done", url: `/api/ai/video/file?uri=${encodeURIComponent(uri)}`, needsAuth: true };
}
