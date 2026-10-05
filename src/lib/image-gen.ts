import { findGeminiKey } from "@/lib/gemini";
import { findHuggingFaceKey } from "@/lib/huggingface";
import type { ImageAspect, ImageStyle, ImageTier } from "@/lib/image-types";

/**
 * Photorealistic image engine.
 * Order: Gemini image models (best quality first for MAX, fastest first for Nexus 5/6) → Hugging Face FLUX → Pollinations FLUX.
 * Every attempt has its own timeout, and a failed engine never blocks the next one.
 */

export class ImageError extends Error {
  constructor(
    public readonly code: "NO_PROVIDER" | "BLOCKED" | "FAILED",
    message: string
  ) {
    super(message);
    this.name = "ImageError";
  }
}

export interface GeneratedImage {
  mime: string;
  /** base64, no data: prefix */
  data: string;
  model: string;
  ms: number;
}

const STYLE_TEXT: Record<ImageStyle, string> = {
  photo:
    "Photorealistic photograph, shot on a full-frame mirrorless camera with a 50mm f/1.8 lens, natural light, true-to-life colour, realistic textures and skin pores, accurate anatomy and hands, believable proportions, subtle film grain.",
  portrait:
    "Photorealistic portrait, 85mm f/1.4 lens, soft window light, sharp eyes, natural skin texture with pores and fine hair, authentic expression, shallow depth of field, accurate hands and teeth.",
  cinematic:
    "Cinematic still frame from a feature film, anamorphic lens, dramatic motivated lighting, volumetric haze, rich colour grade, shallow depth of field, realistic materials and film grain.",
  product:
    "Premium commercial product photograph, seamless studio backdrop, softbox lighting with controlled reflections, razor-sharp detail, accurate materials and true colours, clean composition.",
  food:
    "Editorial food photograph, 100mm macro lens, soft side light, appetising steam and moisture, realistic textures, natural props, shallow depth of field.",
  architecture:
    "Architectural photograph, tilt-shift lens, straight verticals, golden-hour light, realistic materials, accurate perspective and scale, high dynamic range.",
  art:
    "High-end digital painting with confident brushwork, harmonious palette, strong focal point and polished lighting.",
};

const TIER_TEXT: Record<ImageTier, string> = {
  v5: "",
  v6: "Sharp focus on the subject, rich micro-detail, clean background separation.",
  v8: "Professional lighting setup, balanced composition (rule of thirds), micro-contrast, careful colour grading, clean professional retouch.",
  max: "Ultra-detailed 8K-class resolution, physically accurate light, reflections and shadows, editorial retouching, award-winning photography, flawless anatomy and perspective.",
};

const NEGATIVE =
  "Avoid: extra fingers, distorted hands, plastic skin, warped faces, garbled text, watermark, logo, frame, cartoon or CGI look, blur, low resolution.";

/** Turns a short user idea into a rich, camera-aware prompt (no extra LLM call, so it costs zero time). */
export function buildImagePrompt(
  idea: string,
  style: ImageStyle,
  tier: ImageTier,
  aspect: ImageAspect
): string {
  const parts = [idea.trim(), STYLE_TEXT[style], TIER_TEXT[tier], `Aspect ratio ${aspect}.`, NEGATIVE];
  return parts.filter((p) => p.length > 0).join(" ");
}

const GEMINI_FAST = ["gemini-3.1-flash-lite-image", "gemini-2.5-flash-image", "gemini-3.1-flash-image"];
const GEMINI_QUALITY = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
const GEMINI_ULTRA = ["gemini-3-pro-image-preview", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];

function geminiModels(tier: ImageTier): string[] {
  const custom = (process.env.GEMINI_IMAGE_MODEL ?? "").trim();
  const base = tier === "max" ? GEMINI_ULTRA : tier === "v8" ? GEMINI_QUALITY : GEMINI_FAST;
  return Array.from(new Set([...(custom ? [custom] : []), ...base]));
}

const DIMENSIONS: Record<ImageAspect, { w: number; h: number }> = {
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1344, h: 768 },
  "9:16": { w: 768, h: 1344 },
  "4:3": { w: 1152, h: 896 },
  "3:4": { w: 896, h: 1152 },
};

interface RawImage {
  mime: string;
  bytes: Buffer;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
}
interface GeminiImageResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function withTimeout(ms: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  const onOuter = (): void => ctl.abort();
  outer?.addEventListener("abort", onOuter);
  return {
    signal: ctl.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onOuter);
    },
  };
}

async function viaGemini(model: string, key: string, prompt: string, timeoutMs: number): Promise<RawImage> {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }),
      signal: t.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new ImageError("FAILED", `${model}: HTTP ${res.status}`);
    const json = (await res.json()) as GeminiImageResponse;
    if (json.promptFeedback?.blockReason) throw new ImageError("BLOCKED", json.promptFeedback.blockReason);
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    for (const p of parts) {
      const inline = p.inlineData?.data ?? p.inline_data?.data;
      if (inline) {
        const mime = p.inlineData?.mimeType ?? p.inline_data?.mime_type ?? "image/png";
        return { mime, bytes: Buffer.from(inline, "base64") };
      }
    }
    if (json.candidates?.[0]?.finishReason === "IMAGE_SAFETY" || json.candidates?.[0]?.finishReason === "SAFETY") {
      throw new ImageError("BLOCKED", "safety");
    }
    throw new ImageError("FAILED", `${model}: no image in response`);
  } finally {
    t.done();
  }
}

async function viaHuggingFace(token: string, prompt: string, aspect: ImageAspect, timeoutMs: number): Promise<RawImage> {
  const { w, h } = DIMENSIONS[aspect];
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch("https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "image/png" },
      body: JSON.stringify({ inputs: prompt, parameters: { width: w, height: h } }),
      signal: t.signal,
      cache: "no-store",
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new ImageError("FAILED", `huggingface: HTTP ${res.status}`);
    return { mime: type.split(";")[0], bytes: Buffer.from(await res.arrayBuffer()) };
  } finally {
    t.done();
  }
}

async function viaPollinations(prompt: string, aspect: ImageAspect, timeoutMs: number): Promise<RawImage> {
  const { w, h } = DIMENSIONS[aspect];
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=${w}&height=${h}&model=flux&nologo=true&seed=${seed}`;
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { signal: t.signal, cache: "no-store" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new ImageError("FAILED", `pollinations: HTTP ${res.status}`);
    return { mime: type.split(";")[0], bytes: Buffer.from(await res.arrayBuffer()) };
  } finally {
    t.done();
  }
}

/** Big PNGs are re-encoded as high-quality JPEG: 3-5x smaller, so they arrive much faster and fit the response limit. */
async function compact(raw: RawImage): Promise<RawImage> {
  if (raw.bytes.length < 1_400_000) return raw;
  try {
    const sharp = (await import("sharp")).default;
    const out = await sharp(raw.bytes).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
    if (out.length < raw.bytes.length) return { mime: "image/jpeg", bytes: out };
  } catch {
    /* sharp unavailable: send the original */
  }
  return raw;
}

export async function generateImage(opts: {
  prompt: string;
  tier: ImageTier;
  aspect: ImageAspect;
  style: ImageStyle;
}): Promise<GeneratedImage> {
  const started = Date.now();
  const full = buildImagePrompt(opts.prompt, opts.style, opts.tier, opts.aspect);
  const gem = findGeminiKey();
  const hf = findHuggingFaceKey();
  const fast = opts.tier === "v5" || opts.tier === "v6";
  const perTry = fast ? 28_000 : 50_000;
  const deadline = started + 105_000;
  let lastError = "no engine configured";

  const finish = async (raw: RawImage, model: string): Promise<GeneratedImage> => {
    const out = await compact(raw);
    return { mime: out.mime, data: out.bytes.toString("base64"), model, ms: Date.now() - started };
  };

  if (gem) {
    for (const model of geminiModels(opts.tier)) {
      if (Date.now() > deadline - 8_000) break;
      try {
        return await finish(await viaGemini(model, gem.value, full, perTry), model);
      } catch (e) {
        if (e instanceof ImageError && e.code === "BLOCKED") throw e;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  if (hf && Date.now() < deadline - 8_000) {
    try {
      return await finish(await viaHuggingFace(hf.value, full, opts.aspect, perTry), "flux-schnell");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (Date.now() < deadline - 8_000) {
    try {
      return await finish(await viaPollinations(full, opts.aspect, Math.min(perTry, deadline - Date.now())), "flux-pollinations");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new ImageError(gem || hf ? "FAILED" : "NO_PROVIDER", lastError);
}
