/** Generates one picture for the chat (client side) and returns an object URL that renders inline. */
import type { ImageApiOk } from "@/lib/image-types";

export type InlineImage = { ok: true; url: string; ms: number } | { ok: false; code: string };

export async function generateInlineImage(
  authFetch: (input: string, init?: RequestInit) => Promise<Response>,
  prompt: string,
  signal?: AbortSignal
): Promise<InlineImage> {
  try {
    const res = await authFetch("/api/ai/image", {
      method: "POST",
      signal,
      body: JSON.stringify({ prompt: prompt.slice(0, 600), tier: "v8", aspect: "1:1", style: "photo" }),
    });
    if (!res.ok) {
      const d = (await res.json().catch(() => ({}))) as { code?: string };
      return { ok: false, code: d.code ?? "FAILED" };
    }
    const { image } = (await res.json()) as ImageApiOk;
    const bin = atob(image.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, url: URL.createObjectURL(new Blob([bytes], { type: image.mime })), ms: image.ms };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, code: "ABORT" };
    return { ok: false, code: "FAILED" };
  }
}

export const INLINE_IMAGE_ERRORS: Record<string, string> = {
  BLOCKED: "رفض النموذج الوصف لأسباب السلامة. غيّر الصياغة وجرّب مجددًا.",
  NO_PROVIDER: "لم تُضبط مفاتيح توليد الصور على الخادم بعد.",
  RATE: "طلبات كثيرة خلال دقيقة. انتظر قليلًا ثم أعد المحاولة.",
  FAILED: "تعذّر توليد الصورة الآن. أعد المحاولة بعد لحظات.",
  UNAUTHENTICATED: "انتهت الجلسة. سجّل الدخول من جديد.",
};
