/**
 * NEXUS DESIGN v19 — مصدر الملف المراد فحصه/تحسينه
 * ---------------------------------------------------------------------------
 * يقبل أربع طرق إدخال: كود ملصوق، رابط خارجي، موقع منشور على Nexus (slug)،
 * أو ملف من الخزنة (يُجلب من الواجهة ثم يُمرَّر ككود).
 *
 * server-only: يستعمل `netFetch` (حماية SSRF) و `live.ts` (pg + zlib).
 */
import { netFetch } from "@/lib/net/fetch";
import { getSite, isSlug } from "@/lib/live";

/** أكبر مستند نقبل تحسينه (حرفًا) — فوق هذا نطلب التقسيم بدل إخراج ناقص. */
export const MAX_DOC_CHARS = 400_000;
/** أكبر مستند نقبل فحصه (حرفًا) — الفحص محلي ورخيص، فالسقف أعلى. */
export const MAX_AUDIT_CHARS = 2_000_000;

export type ResolvedSource = {
  html: string;
  title: string;
  /** من أين جاء المستند — يظهر في واجهة الاستوديو */
  origin: string;
  bytes: number;
  chars: number;
};

export type SourceError = { code: string; detail: string };

export function isSourceError(x: ResolvedSource | SourceError): x is SourceError {
  return !("html" in x);
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

/** أول عنوان معقول داخل المستند (title ثم h1 ثم اسم النطاق). */
export function titleOf(html: string, fallback: string): string {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  const clean = (s?: string) =>
    (s ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  return clean(t) || clean(h1) || fallback;
}

export async function resolveDesignSource(
  body: Record<string, unknown>,
  uid: string,
  cap = MAX_AUDIT_CHARS
): Promise<ResolvedSource | SourceError> {
  const inline = str(body.html, cap + 1).trim();
  if (inline) {
    if (inline.length > cap) return { code: "TOO_LARGE", detail: `الملف أكبر من ${Math.round(cap / 1000)} ألف حرف` };
    return {
      html: inline,
      title: titleOf(inline, "مشروع"),
      origin: "pasted",
      bytes: Buffer.byteLength(inline, "utf8"),
      chars: inline.length,
    };
  }

  const slug = str(body.slug, 64).trim();
  if (slug) {
    if (!isSlug(slug)) return { code: "BAD_SLUG", detail: "معرّف غير صالح" };
    const site = await getSite(slug, { owner: uid, countView: false });
    if (!site) return { code: "NOT_FOUND", detail: "الموقع غير موجود أو ليس لك" };
    const html = site.html ?? "";
    if (!html.trim()) return { code: "EMPTY", detail: "الموقع فارغ" };
    if (html.length > cap) return { code: "TOO_LARGE", detail: "الموقع أكبر من الحد المسموح للتحسين" };
    return {
      html,
      title: site.title || titleOf(html, slug),
      origin: `live:${slug}`,
      bytes: Buffer.byteLength(html, "utf8"),
      chars: html.length,
    };
  }

  const url = str(body.url, 2048).trim();
  if (url) {
    const res = await netFetch(url, { raw: true, maxBytes: 8_000_000, textChars: cap, timeoutMs: 25_000 });
    if (!res.ok) return { code: res.error || "FETCH_FAILED", detail: `تعذّر جلب ${url}` };
    if (res.kind !== "html" && res.kind !== "text") {
      return { code: "NOT_HTML", detail: `الرابط ليس صفحة HTML (${res.kind || res.mime})` };
    }
    const html = (res.text ?? "").trim();
    if (!html) return { code: "EMPTY", detail: "الصفحة فارغة" };
    if (html.length > cap) return { code: "TOO_LARGE", detail: "الصفحة أكبر من الحد المسموح" };
    return {
      html,
      title: res.title || titleOf(html, url),
      origin: `url:${res.finalUrl || url}`,
      bytes: Buffer.byteLength(html, "utf8"),
      chars: html.length,
    };
  }

  return { code: "NO_SOURCE", detail: "أرسل كودًا أو رابطًا أو موقعًا منشورًا" };
}
