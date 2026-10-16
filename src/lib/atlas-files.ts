/**
 * NEXUS ATLAS — مصنع الملفات (v18)
 * ---------------------------------------------------------------------------
 * Every deliverable Nexus produces is a FILE: the user sees a card with a
 * preview button, a download button, a ZIP button (multi-file) and a public
 * link. This module is the shared, pure vocabulary between the chat UI, the
 * artifact panel and /api/files.
 */

export type FileKind =
  | "html"
  | "svg"
  | "markdown"
  | "json"
  | "csv"
  | "code"
  | "text"
  | "image"
  | "audio"
  | "zip";

export type AtlasFile = {
  id?: string;
  title: string;
  kind: FileKind;
  filename: string;
  mime: string;
  content: string;
  bytes: number;
  extras?: { path: string; data: string }[];
  createdAt?: string;
  views?: number;
  downloads?: number;
  visibility?: "private" | "unlisted";
};

const EXT: Record<FileKind, string> = {
  html: "html",
  svg: "svg",
  markdown: "md",
  json: "json",
  csv: "csv",
  code: "txt",
  text: "txt",
  image: "png",
  audio: "wav",
  zip: "zip",
};

const MIME: Record<FileKind, string> = {
  html: "text/html; charset=utf-8",
  svg: "image/svg+xml",
  markdown: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  code: "text/plain; charset=utf-8",
  text: "text/plain; charset=utf-8",
  image: "image/png",
  audio: "audio/wav",
  zip: "application/zip",
};

const LABEL_AR: Record<FileKind, string> = {
  html: "صفحة ويب",
  svg: "رسم متجهي",
  markdown: "مستند",
  json: "بيانات JSON",
  csv: "جدول CSV",
  code: "كود",
  text: "نص",
  image: "صورة",
  audio: "صوت",
  zip: "أرشيف ZIP",
};

const ICON: Record<FileKind, string> = {
  html: "🌐",
  svg: "🎨",
  markdown: "📄",
  json: "🧩",
  csv: "📊",
  code: "💻",
  text: "📝",
  image: "🖼️",
  audio: "🔊",
  zip: "🗜️",
};

export const fileKindMeta = (k: FileKind) => ({ label: LABEL_AR[k] ?? k, icon: ICON[k] ?? "📄", ext: EXT[k], mime: MIME[k] });

/** Language tag of a fenced block → file kind. */
export function kindFromLang(lang: string, code: string): FileKind {
  const l = (lang || "").toLowerCase().trim();
  if (/^(html|htm)$/.test(l)) return "html";
  if (l === "svg" || (l === "xml" && /^\s*<svg[\s>]/i.test(code))) return "svg";
  if (/^(md|markdown)$/.test(l)) return "markdown";
  if (l === "json" || l === "jsonc") return "json";
  if (/^(csv|tsv)$/.test(l)) return "csv";
  if (/^(txt|text|prompt)$/.test(l)) return "text";
  if (l === "jsx" || l === "tsx" || /^(js|javascript|mjs|ts|typescript|py|python|java|c|cpp|cs|go|rs|rb|php|sh|sql|dart|kt|swift|lua|r)$/.test(l)) return "code";
  if (!l && /^\s*(<!doctype html|<html)/i.test(code)) return "html";
  if (!l && /^\s*<svg[\s>]/i.test(code)) return "svg";
  if (!l && /^\s*[[{]/.test(code) && /["']/.test(code)) {
    try {
      JSON.parse(code);
      return "json";
    } catch {
      /* not json */
    }
  }
  return "text";
}

const AR_SLUG_STOP = new Set(["في", "من", "على", "عن", "الى", "إلى", "مع", "هذا", "هذه", "the", "a", "an", "of", "for", "and"]);

/** A safe, pretty filename from a title. */
export function slugFilename(title: string, kind: FileKind, mode: "smart" | "title" | "timestamp" = "smart"): string {
  const ext = EXT[kind] ?? "txt";
  const raw = (title || "").replace(/```/g, " ").trim();
  let base = raw
    .split("\n")[0]
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .split(/\s+/)
    .filter((w) => w && !AR_SLUG_STOP.has(w.toLowerCase()))
    .slice(0, 7)
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (!base || base.length < 2) base = `nexus-${kind}`;
  if (mode === "timestamp") base = `${base}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  if (mode === "smart" && base.toLowerCase() === `nexus-${kind}`) base = `${base}-${Date.now().toString(36).slice(-5)}`;
  return `${base.slice(0, 80)}.${ext}`;
}

/** Byte length (UTF-8 aware, browser + server). */
export function byteLength(s: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length;
  return s.length;
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(2)} MB`;
}

/** First fenced block title hint: ```html My page ``` */
export function titleFromFence(info: string, fallback: string): string {
  const rest = (info || "").replace(/^[a-z0-9+#.-]+\s*/i, "").trim();
  return rest.slice(0, 80) || fallback;
}

export function buildFile(o: {
  title?: string;
  lang?: string;
  code: string;
  info?: string;
  naming?: "smart" | "title" | "timestamp";
}): AtlasFile {
  const kind = kindFromLang(o.lang ?? "", o.code);
  const title = (o.title ?? titleFromFence(o.info ?? "", kind === "html" ? "صفحة Nexus" : `ملف ${kind}`)).slice(0, 120);
  const filename = slugFilename(title, kind, o.naming ?? "smart");
  const meta = fileKindMeta(kind);
  return {
    title,
    kind,
    filename,
    mime: meta.mime,
    content: o.code,
    bytes: byteLength(o.code),
    extras: [],
  };
}

/** Data URL for a text file — lets the browser preview/download without a server round-trip. */
export function dataUrlFor(f: { mime: string; content: string }): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(String.fromCharCode(...new TextEncoder().encode(f.content)))
      : Buffer.from(f.content, "utf8").toString("base64");
  return `data:${f.mime.split(";")[0]};base64,${b64}`;
}

/** Triggers a browser download from a string (no server needed — works offline). */
export function downloadTextFile(f: { filename: string; mime: string; content: string }): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([f.content], { type: f.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Downloads a remote file (data URL / server route) by clicking an <a>. */
export function downloadUrl(url: string, filename: string): void {
  if (typeof document === "undefined") return;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  if (!/^data:/.test(url)) a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
