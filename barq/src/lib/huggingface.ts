/**
 * Hugging Face Inference (OpenAI-compatible router).
 * Vercel → Settings → Environment Variables → add ONE of:
 *   HF_TOKEN  (or HUGGINGFACE_API_KEY / HUGGING_FACE_HUB_TOKEN / HF_API_KEY)
 * Optional: HUGGINGFACE_MODEL=org/model   (tried first)
 * Create the token at https://huggingface.co/settings/tokens (permission: "Make calls to Inference Providers").
 */

export const HF_URL = "https://router.huggingface.co/v1/chat/completions";

const KEY_NAMES = [
  "HF_TOKEN",
  "HUGGINGFACE_API_KEY",
  "HUGGING_FACE_HUB_TOKEN",
  "HUGGINGFACE_TOKEN",
  "HF_API_KEY",
  "HUGGINGFACE_KEY",
];

/** Strongest open models first; override the first one with HUGGINGFACE_MODEL. */
export const HF_DEFAULT_MODELS = [
  "Qwen/Qwen3-Coder-480B-A35B-Instruct",
  "deepseek-ai/DeepSeek-V3.1",
  "Qwen/Qwen3-235B-A22B-Instruct-2507",
  "meta-llama/Llama-3.3-70B-Instruct",
];

const clean = (v: string | undefined): string =>
  (v ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();

/** Returns the variable NAME (never the value) and the cleaned token. */
export function findHuggingFaceKey(): { name: string; value: string } | undefined {
  const env = process.env;
  const upper = new Map<string, string>();
  for (const k of Object.keys(env)) upper.set(k.toUpperCase(), k);
  for (const n of KEY_NAMES) {
    const real = upper.get(n);
    const v = real ? clean(env[real]) : "";
    if (v) return { name: real as string, value: v };
  }
  for (const k of Object.keys(env)) {
    if (k.startsWith("NEXT_PUBLIC_")) continue;
    const v = clean(env[k]);
    if (/^hf_[A-Za-z0-9]{30,}$/.test(v)) return { name: k, value: v };
  }
  return undefined;
}

export function huggingFaceModels(): string[] {
  const custom = clean(process.env.HUGGINGFACE_MODEL) || clean(process.env.HF_MODEL);
  return Array.from(new Set([...(custom ? [custom] : []), ...HF_DEFAULT_MODELS]));
}
