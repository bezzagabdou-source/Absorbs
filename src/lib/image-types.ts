/** Client-safe image types and constants (no server imports). */

export type ImageTier = "v5" | "v6" | "v8" | "max";
export type ImageAspect = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
export type ImageStyle = "photo" | "portrait" | "cinematic" | "product" | "food" | "architecture" | "art" | "epic" | "render3d" | "anime";

/** How many variants each model level creates in parallel: the higher the level, the more to choose from. */
export const IMAGE_TIER_COUNT: Record<ImageTier, number> = { v5: 1, v6: 1, v8: 2, max: 3 };

export const IMAGE_TIER_LABEL: Record<ImageTier, string> = {
  v5: "Nexus 5 · سريع",
  v6: "Nexus 6 · عالي الدقة",
  v8: "Nexus 8 · احترافي",
  max: "MAX · أسطوري",
};

export const IMAGE_TIER_HINT: Record<ImageTier, string> = {
  v5: "صورة واحدة بأقصى سرعة",
  v6: "صورة واحدة بتفاصيل أدق",
  v8: "صورتان لتختار الأفضل، إضاءة وتكوين احترافيان",
  max: "3 نسخ بأقوى نموذج صور وتفاصيل فائقة",
};

export const IMAGE_STYLES: { id: ImageStyle; label: string }[] = [
  { id: "photo", label: "واقعية" },
  { id: "portrait", label: "بورتريه" },
  { id: "cinematic", label: "سينمائية" },
  { id: "product", label: "منتج" },
  { id: "food", label: "طعام" },
  { id: "architecture", label: "عمارة" },
  { id: "art", label: "فنية" },
  { id: "epic", label: "أسطورية" },
  { id: "render3d", label: "3D" },
  { id: "anime", label: "أنمي" },
];

export const IMAGE_ASPECTS: { id: ImageAspect; label: string }[] = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:3", label: "4:3" },
  { id: "3:4", label: "3:4" },
];

export const IMAGE_PROMPT_MAX = 1200;

/** Reference image ("generate according to my picture"): downscaled in the browser, validated on the server. */
export const IMAGE_REF_MAX_BYTES = 2_600_000; // base64 payload ceiling (keeps the request far below Vercel's 4.5 MB)
export const IMAGE_REF_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export interface ImageReference {
  mime: string;
  /** base64, no data: prefix */
  data: string;
}

/** Image edit ("remove this", "redesign this"): the picture is the reference, the prompt is the instruction. */
export type ImageEditAction = "remove" | "redesign" | "change";
export const IMAGE_EDIT_ACTIONS: readonly ImageEditAction[] = ["remove", "redesign", "change"];
export interface ImageEditPoint {
  /** 0..100, percent from the left / top of the picture */
  x: number;
  y: number;
}
export function isImageEditAction(v: unknown): v is ImageEditAction {
  return v === "remove" || v === "redesign" || v === "change";
}

export interface ImageApiOk {
  image: { mime: string; data: string; model: string; ms: number };
}

export function isImageTier(v: unknown): v is ImageTier {
  return v === "v5" || v === "v6" || v === "v8" || v === "max";
}
export function isImageAspect(v: unknown): v is ImageAspect {
  return v === "1:1" || v === "16:9" || v === "9:16" || v === "4:3" || v === "3:4";
}
export function isImageStyle(v: unknown): v is ImageStyle {
  return IMAGE_STYLES.some((s) => s.id === v);
}
