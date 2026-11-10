/**
 * صور المسابقات: رفع صورة من اللوحة وتخزينها داخل نفس التخزين (data URL)
 * أو استخدام رابط خارجي https.
 */

export const MAX_IMAGE_BYTES = 1_500_000; // 1.5 ميغا
export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export type UploadResult = { dataUrl?: string; error?: string };

/** يقرأ حقل ملف الصورة من الفورم ويحوّله إلى data URL */
export async function readUploadedImage(form: FormData, field = "image"): Promise<UploadResult> {
  const value = form.get(field);
  if (!value || typeof value === "string") return {};
  const file = value as File;
  if (!file.size) return {};
  if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { error: "صيغة الصورة غير مدعومة — استعمل PNG أو JPG أو WEBP أو GIF" };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: `الصورة كبيرة (${Math.round(file.size / 1024)} كيلو) — الحد 1.5 ميغا` };
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/png";
  return { dataUrl: `data:${mime};base64,${buffer.toString("base64")}` };
}

/** رابط صورة خارجي مسموح (http/https فقط) */
export function normalizeImageUrl(raw: string): string | null {
  const value = (raw || "").trim();
  if (!value) return null;
  if (value.startsWith("data:image/")) return value;
  if (!/^https?:\/\/\S+$/i.test(value)) return null;
  return value;
}

export function isInlineImage(value?: string): boolean {
  return Boolean(value && value.startsWith("data:image/"));
}

/** يفك data URL إلى نوع المحتوى + البايتات */
export function decodeInlineImage(value: string): { mime: string; bytes: Uint8Array } | null {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(value || "");
  if (!match) return null;
  try {
    const bin = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: match[1], bytes };
  } catch {
    return null;
  }
}
