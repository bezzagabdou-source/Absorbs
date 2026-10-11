import { findGeminiKey } from "@/lib/gemini";
import { findHuggingFaceKey } from "@/lib/huggingface";
import { findEnvKey } from "@/lib/openai-stream";
import type { ImageAspect, ImageEditAction, ImageEditPoint, ImageReference, ImageStyle, ImageTier } from "@/lib/image-types";
import { planArabicImage, ARABIC_NEGATIVE } from "@/lib/arabic-vision";
import { ensureEnglishPrompt, translateArabicPrompt, hasArabicChars } from "@/lib/arabic-image-lexicon";

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
  epic:
    "Epic legendary concept art, monumental scale, dramatic god-rays and volumetric atmosphere, heroic composition, intricate detail, rich saturated colour grading, museum-grade masterpiece, matte-painting depth.",
  render3d:
    "Premium 3D render, physically based materials, global illumination, soft studio lighting with rim light, subsurface scattering, crisp edges, ultra-clean composition, Octane / Blender Cycles quality.",
  anime:
    "High-end anime key visual, clean confident line art, expressive eyes, cel shading with soft gradients, vivid harmonious palette, cinematic lighting, detailed painted background.",
};

const TIER_TEXT: Record<ImageTier, string> = {
  v5: "",
  v6: "Sharp focus on the subject, rich micro-detail, clean background separation, natural colour, crisp edges.",
  v8: "Legendary studio-grade quality: professional multi-light setup, balanced composition (rule of thirds), micro-contrast, physically accurate reflections and shadows, careful cinematic colour grading, editorial retouch, 8K-class detail.",
  max: "Legendary ultra-detailed 8K-class resolution, physically accurate light, reflections and shadows, razor-sharp focus on the subject, rich micro-texture, perfect anatomy and perspective, cinematic colour grading, editorial retouching, award-winning masterpiece.",
};

const NEGATIVE =
  "Avoid: extra fingers, distorted hands, plastic skin, warped faces, garbled text, watermark, logo, frame, cartoon or CGI look, blur, low resolution, dull flat lighting, muddy grey colours, cluttered background, cropped subject, oversharpening halos.";

/** v16 STUDIO ART DIRECTION — appended to every prompt so even a one-word idea renders like a professional shot. */
const ART_DIRECTION =
  "Art direction: thought-out composition with a clear focal point and breathing room, professional lighting design with motivated light sources, harmonious colour grading (no random rainbow), clean separation between subject and background, believable materials and micro-texture, and a mood that fits the subject. The image must look intentionally crafted by a top studio, not randomly generated.";

const TIER_ART: Partial<Record<ImageTier, string>> = {
  v6: ART_DIRECTION,
  v8: ART_DIRECTION + " Editorial-level retouching and colour science; treat the frame like a magazine cover.",
  max: ART_DIRECTION + " Award-winning gallery piece: museum-grade detail and masterful cinematic light.",
};

/** Turns a short user idea into a rich, camera-aware prompt (no extra LLM call, so it costs zero time). */
export function buildImagePrompt(
  idea: string,
  style: ImageStyle,
  tier: ImageTier,
  aspect: ImageAspect
): string {
  const subject = idea.trim();
  // v11 ARABIC VISION: understand the Darija / Arabic intent, and protect any words that must
  // literally appear inside the picture so the engine cannot mangle or translate them.
  const plan = planArabicImage(subject);
  const arabicText = plan.needsArabicTypography
    ? `TEXT IN THE IMAGE — render these strings EXACTLY and verbatim: ${plan.renderText
        .map((t) => `"${t}"`)
        .join(", ")}. Right-to-left Arabic script with correctly joined letters, correct spelling, large, perfectly legible, well kerned, no invented glyphs, no Latin transliteration.`
    : plan.arabic
    ? "Do not draw any written text, caption or lettering unless the subject explicitly asks for it."
    : "";
  // the user's subject comes first and is repeated as a hard requirement, so the style text can never replace it
  const parts = [
    `MAIN SUBJECT (draw exactly this, nothing else, no random substitutes): ${plan.prompt}.`,
    STYLE_TEXT[style],
    TIER_TEXT[tier],
    TIER_ART[tier] ?? "",
    `Aspect ratio ${aspect}.`,
    arabicText,
    NEGATIVE,
    plan.needsArabicTypography ? ARABIC_NEGATIVE : "",
    `Every object, person, colour, place and text mentioned in the main subject must be clearly visible.`,
  ];
  return parts.filter((p) => p.length > 0).join(" ");
}

/** FLUX engines do not understand Arabic / Darija: translate the idea faithfully to English first (fast, cached, falls back to the original). */
const translateCache = new Map<string, string>();
async function toEnglishIdea(idea: string, gemKey?: string): Promise<string> {
  const text = idea.trim();
  if (!/[^\u0000-\u024F\s\d.,!?'"()\-:;]/.test(text)) return text; // already Latin script
  const hit = translateCache.get(text);
  if (hit) return hit;
  if (!gemKey) return text;
  const t = withTimeout(7_000);
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": gemKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: `You are the world-class CREATIVE DIRECTOR of Nexus AI's image studio, perfectly fluent in Arabic, every Arabic dialect (Algerian, Moroccan, Tunisian, Egyptian, Gulf, Levantine), French and English.
JOB: take the user's raw image request — which may contain spelling mistakes, voice-to-text errors, Darija slang, mixed Arabic-French, or be a single vague word — and output ONE rich, precise English image description that an image generator can execute perfectly.
RULES:
1. DECODE the true intent behind typos and slang silently (تصاورة/سورة/صصور = صورة, "dwija" etc.). Never complain, never ask questions.
2. FIDELITY: every object, person, animal, clothing item, colour, number, place and action the user named MUST appear in your description — add nothing that contradicts it.
3. ART DIRECTION (this is what makes the result beautiful): specify the composition (rule of thirds / symmetry / leading lines), the shot type (close-up / wide / aerial), the lighting (golden hour, softbox, neon rim, volumetric), the colour mood (harmonious palette, named hues), the depth of field, and one or two texture/detail anchors (skin pores, wet asphalt reflections, woven fabric, desert sand grains…).
4. If the user describes a person, keep ethnicity, clothing and setting faithful to the request (Algerian context when implied: traditional dress, Casbah, Sahara…).
5. Output ONLY the English description in one flowing sentence group (60-130 words). No quotes, no preamble, no explanations.`,
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300 },
      }),
      signal: t.signal,
      cache: "no-store",
    });
    if (!res.ok) return text;
    const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const out = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (out.length < 3) return text;
    if (translateCache.size > 200) translateCache.clear();
    translateCache.set(text, out);
    return out;
  } catch {
    return text;
  } finally {
    t.done();
  }
}

const GEMINI_FAST = ["gemini-3.1-flash-lite-image", "gemini-2.5-flash-image", "gemini-3.1-flash-image"];
const GEMINI_QUALITY = ["gemini-3.1-flash-image", "gemini-2.5-flash-image"];
const GEMINI_ULTRA = ["gemini-3-pro-image-preview", "gemini-3.1-flash-image", "gemini-2.5-flash-image"];

function geminiModels(tier: ImageTier, arabicText = false): string[] {
  const custom = (process.env.GEMINI_IMAGE_MODEL ?? "").trim();
  // v15: when real Arabic lettering has to appear inside the picture, only the
  // strongest Gemini image models render joined RTL script correctly — never the
  // lite one, whatever the tier is.
  const base = arabicText
    ? GEMINI_ULTRA
    : tier === "max"
      ? GEMINI_ULTRA
      : tier === "v8"
        ? GEMINI_QUALITY
        : GEMINI_FAST;
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

const REF_INSTRUCTION =
  "REFERENCE IMAGE ATTACHED: use it as the visual source. Keep the same main subject, identity, face, pose, proportions, colours and overall composition unless the request below explicitly asks to change them, and apply the requested style, lighting and quality on top. Do not copy any watermark or text. Request: ";

async function viaGemini(model: string, key: string, prompt: string, timeoutMs: number, ref?: ImageReference): Promise<RawImage> {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: ref
              ? [{ inlineData: { mimeType: ref.mime, data: ref.data } }, { text: REF_INSTRUCTION + prompt }]
              : [{ text: prompt }],
          },
        ],
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

async function viaPollinations(prompt: string, aspect: ImageAspect, timeoutMs: number, engine = "flux"): Promise<RawImage> {
  const { w, h } = DIMENSIONS[aspect];
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=${w}&height=${h}&model=${engine}&nologo=true&enhance=true&seed=${seed}`;
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

/** Builds the instruction for an edit: change ONLY what was asked, keep everything else pixel-faithful. */
export function buildEditPrompt(instruction: string, action: ImageEditAction, point?: ImageEditPoint): string {
  const where = point
    ? ` The target is the element located at about ${Math.round(point.x)}% from the left edge and ${Math.round(point.y)}% from the top edge of the picture (the element under that exact spot, including its whole outline).`
    : "";
  const what = instruction.trim();
  const head =
    action === "remove"
      ? `EDIT THE ATTACHED IMAGE: completely remove the requested element and fill the space with a natural, seamless continuation of the surrounding background (matching texture, light, shadows and perspective). Leave no trace, no blur patch, no ghost outline.${where} Element to remove: ${what || "the element at the marked spot"}.`
      : action === "redesign"
        ? `EDIT THE ATTACHED IMAGE: redesign ONLY the requested element, in the same position, scale, perspective and lighting as the original.${where} New design requested: ${what || "a better, more polished design"}.`
        : `EDIT THE ATTACHED IMAGE: apply exactly this change and nothing else.${where} Change requested: ${what}.`;
  return `${head} Keep every other part of the picture identical: same people, faces, pose, composition, colours, framing and image quality. Do not add watermark, frame or text unless asked.`;
}

/** OpenRouter image models (chat/completions with image output) — extra engine, also used when Gemini is down. */
/**
 * Extra, stronger image engines on OpenRouter. OPENROUTER_IMAGE_MODEL (comma-separated) goes first so a newer
 * model can be added from env; a busy / unknown id just fails over to the next one.
 */
const OPENROUTER_IMAGE_MODELS = Array.from(
  new Set([
    ...(process.env.OPENROUTER_IMAGE_MODEL ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    "google/gemini-2.5-flash-image",
    "google/gemini-3.1-flash-image-preview",
    "openai/gpt-5-image-mini",
  ])
);

async function viaOpenRouterImage(
  model: string,
  key: string,
  prompt: string,
  timeoutMs: number,
  ref?: ImageReference
): Promise<RawImage> {
  const t = withTimeout(timeoutMs);
  try {
    const content = ref
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${ref.mime};base64,${ref.data}` } },
        ]
      : prompt;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "X-Title": "Nexus AI",
      },
      body: JSON.stringify({ model, modalities: ["image", "text"], messages: [{ role: "user", content }] }),
      signal: t.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new ImageError("FAILED", `openrouter ${model}: HTTP ${res.status}`);
    const j = (await res.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    };
    const url = j.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
    const m = /^data:(image\/[\w+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m) throw new ImageError("FAILED", `openrouter ${model}: no image in response`);
    return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
  } finally {
    t.done();
  }
}

export async function generateImage(opts: {
  prompt: string;
  tier: ImageTier;
  aspect: ImageAspect;
  style: ImageStyle;
  /** optional reference picture: only the Gemini image models can follow it */
  reference?: ImageReference;
  /** edit mode: `reference` is the picture to edit and `prompt` is the instruction */
  edit?: { action: ImageEditAction; point?: ImageEditPoint };
}): Promise<GeneratedImage> {
  const started = Date.now();
  let full = buildImagePrompt(opts.prompt, opts.style, opts.tier, opts.aspect);
  if (opts.edit && opts.reference) {
    // Gemini reads Arabic natively; the English twin removes any ambiguity for the other engines
    const gemForEdit = findGeminiKey();
    const en = await toEnglishIdea(opts.prompt, gemForEdit?.value);
    const instr = en !== opts.prompt.trim() ? `${opts.prompt.trim()} (${en})` : opts.prompt.trim();
    full = buildEditPrompt(instr, opts.edit.action, opts.edit.point);
  }
  const gem = findGeminiKey();
  // does the picture itself have to contain Arabic words?
  const needsArabicText = planArabicImage(opts.prompt).needsArabicTypography;
  let fluxPrompt: string | undefined;
  const getFluxPrompt = async (): Promise<string> => {
    if (fluxPrompt) return fluxPrompt;
    // v14: toEnglishIdea() needs a Gemini key. Without one it used to return the
    // Arabic string unchanged and Flux/Pollinations rendered a random picture.
    // ensureEnglishPrompt() falls back to a deterministic offline translator so an
    // Arabic request ALWAYS reaches the engine in English.
    let llm = "";
    try {
      llm = await toEnglishIdea(opts.prompt, gem?.value);
    } catch {
      llm = "";
    }
    const en = ensureEnglishPrompt(opts.prompt, llm);
    fluxPrompt = buildImagePrompt(en, opts.style, opts.tier, opts.aspect);
    return fluxPrompt;
  };
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
    for (const model of geminiModels(opts.tier, needsArabicText)) {
      if (Date.now() > deadline - 8_000) break;
      try {
        return await finish(await viaGemini(model, gem.value, full, perTry, opts.reference), model);
      } catch (e) {
        if (e instanceof ImageError && e.code === "BLOCKED") throw e;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  const orKey = findEnvKey(["OPENROUTER_API_KEY"]);
  if (orKey) {
    for (const model of OPENROUTER_IMAGE_MODELS) {
      if (Date.now() > deadline - 8_000) break;
      try {
        return await finish(await viaOpenRouterImage(model, orKey, full, perTry, opts.reference), `openrouter:${model}`);
      } catch (e) {
        if (e instanceof ImageError && e.code === "BLOCKED") throw e;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  // engines below cannot read a reference picture: with one attached, fail honestly instead of ignoring it
  if (opts.reference) throw new ImageError(gem ? "FAILED" : "NO_PROVIDER", lastError);
  if (hf && Date.now() < deadline - 8_000) {
    try {
      return await finish(await viaHuggingFace(hf.value, await getFluxPrompt(), opts.aspect, perTry), "flux-schnell");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  if (Date.now() < deadline - 8_000) {
    try {
      return await finish(await viaPollinations(await getFluxPrompt(), opts.aspect, Math.min(perTry, deadline - Date.now())), "flux-pollinations");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  // last resort: a second, different Pollinations engine
  if (Date.now() < deadline - 8_000) {
    try {
      return await finish(await viaPollinations(await getFluxPrompt(), opts.aspect, Math.min(perTry, deadline - Date.now()), "turbo"), "turbo-pollinations");
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new ImageError(gem || hf ? "FAILED" : "NO_PROVIDER", lastError);
}
