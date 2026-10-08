/** Generates one picture for the chat (client side) and returns an object URL that renders inline. */
import type { ImageApiOk, ImageAspect, ImageStyle, ImageTier } from "@/lib/image-types";

export type InlineImage = { ok: true; url: string; ms: number } | { ok: false; code: string };

const TIMEOUT_MS = 100_000; // server maxDuration is 120 s
const RETRYABLE = new Set(["FAILED", "ERROR", "NETWORK"]);

interface Opts {
  signal?: AbortSignal;
  aspect?: ImageAspect;
  style?: ImageStyle;
  tier?: ImageTier;
}

async function once(
  authFetch: (input: string, init?: RequestInit) => Promise<Response>,
  prompt: string,
  { signal, aspect = "1:1", style = "photo", tier = "v8" }: Opts
): Promise<InlineImage> {
  // hard timeout + caller abort share one controller so the spinner can never hang forever
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await authFetch("/api/ai/image", {
      method: "POST",
      signal: ctl.signal,
      body: JSON.stringify({ prompt: prompt.slice(0, 600), tier, aspect, style }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { code?: string };
      return { ok: false, code: d.code ?? "FAILED" };
    }
    const { image } = (await res.json()) as ImageApiOk;
    if (!image?.data) return { ok: false, code: "FAILED" };
    const bin = atob(image.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, url: URL.createObjectURL(new Blob([bytes], { type: image.mime })), ms: image.ms };
  } catch (e) {
    if (signal?.aborted) return { ok: false, code: "ABORT" };
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, code: "FAILED" }; // timeout
    return { ok: false, code: "NETWORK" };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** One automatic retry on transient failures (never on safety blocks, rate limits or auth errors). */
export async function generateInlineImage(
  authFetch: (input: string, init?: RequestInit) => Promise<Response>,
  prompt: string,
  opts: Opts = {}
): Promise<InlineImage> {
  const first = await once(authFetch, prompt, opts);
  if (first.ok || !RETRYABLE.has(first.code) || opts.signal?.aborted) return first;
  await new Promise((r) => setTimeout(r, 1200));
  return once(authFetch, prompt, opts);
}

export const INLINE_IMAGE_ERRORS: Record<string, string> = {
  BLOCKED: "رفض النموذج الوصف لأسباب السلامة. غيّر الصياغة وجرّب مجددًا.",
  NO_PROVIDER: "لم تُضبط مفاتيح توليد الصور على الخادم بعد.",
  RATE: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
  FAILED: "تعذّر توليد الصورة الآن. أعد المحاولة بعد لحظات.",
  NETWORK: "انقطع الاتصال أثناء الرسم. تأكد من الإنترنت وأعد المحاولة.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
};
