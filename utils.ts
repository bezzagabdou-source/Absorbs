import { clsx, type ClassValue } from "clsx";

/** Merge class names — keeps call-sites tidy and conditional-friendly. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log2(bytes) / 10));
  const value = bytes / 2 ** (10 * i);
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function timeLabel(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diff = now - date.getTime();
  const day = 86_400_000;
  if (diff < 60_000) return "الآن";
  if (diff < 3_600_000) return `قبل ${Math.max(1, Math.round(diff / 60_000))} د`;
  if (diff < day) return `قبل ${Math.round(diff / 3_600_000)} س`;
  if (diff < 7 * day) return `قبل ${Math.round(diff / day)} يوم`;
  return date.toLocaleDateString("ar-DZ", { day: "numeric", month: "short" });
}
