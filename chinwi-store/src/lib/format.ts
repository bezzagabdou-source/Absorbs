/** أدوات تنسيق مشتركة بين البوت ولوحة التحكم */

export function money(value: number | string | null | undefined, currency = "دج"): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return `0 ${currency}`;
  const rounded = Math.round(n * 100) / 100;
  const text = rounded % 1 === 0 ? rounded.toLocaleString("en-US") : rounded.toLocaleString("en-US", { minimumFractionDigits: 2 });
  return `${text} ${currency}`;
}

export function num(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function shortDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-DZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value).getTime();
  if (Number.isNaN(d)) return "—";
  const diff = Math.max(0, Date.now() - d);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `قبل ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return shortDate(value);
}

export function statusText(status: string): string {
  switch (status) {
    case "pending_payment":
      return "بانتظار الدفع";
    case "awaiting_review":
      return "قيد التحقق";
    case "approved":
      return "مقبول";
    case "rejected":
      return "مرفوض";
    case "delivered":
      return "تم التسليم";
    case "cancelled":
      return "ملغى";
    default:
      return status;
  }
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function mask(text: string, keep = 4): string {
  const s = String(text ?? "");
  if (s.length <= keep * 2) return s;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}
