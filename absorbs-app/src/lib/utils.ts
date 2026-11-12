import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/* ── Username rules: 3–20 chars, lowercase letters, digits, dot, underscore ── */
export const USERNAME_REGEX = /^[a-z0-9_.]{3,20}$/;

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/^@+/, "").replace(/\s+/g, "");
}

export function isValidUsername(username: string) {
  return USERNAME_REGEX.test(username);
}

/* ── Arabic relative time ── */
export function timeAgoAr(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "الآن";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `قبل ${days} ي`;
  return new Date(iso).toLocaleDateString("ar-DZ", { day: "numeric", month: "short", year: "numeric" });
}

export function messageTimeAr(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? time : `${d.toLocaleDateString("ar-DZ", { day: "numeric", month: "short" })} · ${time}`;
}

export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Deterministic gradient (for avatar fallbacks) from any string. */
const GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-cyan-400 to-blue-600",
  "from-amber-400 to-orange-600",
  "from-violet-400 to-indigo-600",
  "from-sky-400 to-indigo-600",
  "from-lime-400 to-indigo-600",
];

export function gradientFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return GRADIENTS[hash % GRADIENTS.length];
}

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Down-scale + JPEG-compress an image in the browser before uploading it. */
export async function compressImage(file: File, maxSize = 1600, quality = 0.85): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 1_500_000) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality));
}

/** True when a Supabase error means "schema.sql has not been executed yet". */
export function isSchemaMissing(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.code === "PGRST202" ||
    /relation .* does not exist|Could not find the table|Could not find the function/i.test(error.message ?? "")
  );
}

export function friendlyError(error: { message?: string } | null | undefined, fallback = "حدث خطأ غير متوقع، حاول مجددًا"): string {
  const msg = error?.message ?? "";
  if (/Invalid login credentials/i.test(msg)) return "البريد أو كلمة المرور غير صحيحة";
  if (/Email not confirmed/i.test(msg)) return "فعّل حسابك أولًا من رابط التأكيد في بريدك الإلكتروني";
  if (/User already registered/i.test(msg)) return "هذا البريد مسجّل مسبقًا — جرّب تسجيل الدخول";
  if (/Password should be at least/i.test(msg)) return "كلمة المرور قصيرة — 8 أحرف على الأقل";
  if (/duplicate key|profiles_username_key/i.test(msg)) return "اسم المستخدم هذا محجوز، اختر اسمًا آخر";
  if (/row-level security|permission denied/i.test(msg)) return "ليس لديك صلاحية لهذا الإجراء — تأكد من تنفيذ ملف schema.sql كاملًا";
  if (/Failed to fetch|NetworkError/i.test(msg)) return "تعذّر الاتصال بالشبكة — تحقق من الإنترنت ثم حاول مجددًا";
  return msg ? `${fallback}` : fallback;
}
