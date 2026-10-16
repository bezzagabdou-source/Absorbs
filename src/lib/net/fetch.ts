/**
 * NEXUS ATLAS — محرك الإنترنت (v18)
 * ---------------------------------------------------------------------------
 * The app's own internet layer: read any public URL, pull down images / audio /
 * datasets / archives, inspect them and hand the model something it can
 * actually quote. Built to be SAFE by default:
 *
 *   · http/https only, public IPs only (SSRF guard with DNS resolution)
 *   · hard size + time caps, redirects limited
 *   · content-type aware: text is converted to readable text, JSON/CSV are
 *     summarised structurally, archives are listed, images/audio are measured
 *     and returned as base64 data URLs (small ones) or stored in the vault.
 */

export type FetchKind = "html" | "text" | "json" | "csv" | "image" | "audio" | "video" | "pdf" | "archive" | "binary" | "unknown";

export type NetFetchResult = {
  ok: boolean;
  url: string;
  finalUrl: string;
  status: number;
  kind: FetchKind;
  mime: string;
  bytes: number;
  ms: number;
  title?: string;
  /** readable text (html stripped) or a structural summary for data files */
  text: string;
  /** base64 data URL for small binary payloads (images/audio) */
  dataUrl?: string;
  /** archive listing */
  entries?: string[];
  /** json shape summary */
  shape?: string;
  error?: string;
  headers?: Record<string, string>;
};

const MAX_TEXT_BYTES = 4_000_000;
const MAX_BINARY_BYTES = 25_000_000;
const UA =
  "Mozilla/5.0 (compatible; NexusAtlas/18.0; +https://nexus.dz/bot) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36";

/* ─────────────────────────── SSRF guard ─────────────────────────── */

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  const v = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (v === "localhost" || v.endsWith(".local") || v.endsWith(".internal")) return true;
  if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v === "::" || v === "::1") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(v);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a >= 224) return true;
  return false;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("INVALID_URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("BAD_PROTOCOL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateIp(host)) throw new Error("PRIVATE_HOST");
  // resolve the name and refuse private ranges hidden behind DNS
  try {
    const dns = await import("node:dns/promises");
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    for (const a of addrs) if (isPrivateIp(a.address)) throw new Error("PRIVATE_HOST");
  } catch (e) {
    if ((e as Error).message === "PRIVATE_HOST") throw e;
    /* DNS failure: let fetch produce the real error */
  }
  return u;
}

/* ─────────────────────────── content helpers ─────────────────────────── */

const KIND_BY_MIME: [RegExp, FetchKind][] = [
  [/^text\/html|^application\/xhtml/, "html"],
  [/^application\/json|\/json$|\+json$/, "json"],
  [/^text\/csv|^application\/csv/, "csv"],
  [/^text\/|^application\/xml|\+xml$/, "text"],
  [/^image\/svg/, "text"],
  [/^image\//, "image"],
  [/^audio\//, "audio"],
  [/^video\//, "video"],
  [/^application\/pdf/, "pdf"],
  [/zip|tar|gzip|7z|x-rar|compressed/, "archive"],
];

export function kindOf(mime: string, url: string): FetchKind {
  const m = (mime || "").toLowerCase();
  for (const [re, k] of KIND_BY_MIME) if (re.test(m)) return k;
  const ext = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(url)?.[1]?.toLowerCase() ?? "";
  const byExt: Record<string, FetchKind> = {
    html: "html", htm: "html", xhtml: "html", json: "json", csv: "csv", tsv: "csv", txt: "text", md: "text",
    xml: "text", yml: "text", yaml: "text", log: "text", js: "text", ts: "text", py: "text", css: "text",
    svg: "text", png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", avif: "image",
    bmp: "image", ico: "image", mp3: "audio", wav: "audio", ogg: "audio", m4a: "audio", flac: "audio",
    aac: "audio", opus: "audio", mp4: "video", webm: "video", mov: "video", mkv: "video", avi: "video",
    pdf: "pdf", zip: "archive", tar: "archive", gz: "archive", tgz: "archive", rar: "archive", "7z": "archive",
  };
  return byExt[ext] ?? "unknown";
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…",
  laquo: "«", raquo: "»", eacute: "é", egrave: "è", ccedil: "ç", agrave: "à", ugrave: "ù",
};

export function htmlToReadable(html: string): { title: string; text: string; links: string[] } {
  let src = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, " ");
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src)?.[1]?.trim() ?? "";
  const links: string[] = [];
  const hrefRe = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = hrefRe.exec(src)) && links.length < 60) {
    const label = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (/^https?:\/\//i.test(m[1])) links.push(label ? `${label} — ${m[1]}` : m[1]);
  }
  src = src
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<h([1-6])[^>]*>/gi, (_a, n) => "\n" + "#".repeat(Number(n)) + " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (_a, e: string) => {
      if (e.startsWith("#x") || e.startsWith("#X")) return String.fromCharCode(parseInt(e.slice(2), 16));
      if (e.startsWith("#")) return String.fromCharCode(parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? `&${e};`;
    })
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { title: title.slice(0, 200), text: src, links };
}

function summarizeJson(raw: string): { shape: string; text: string } {
  try {
    const j = JSON.parse(raw) as unknown;
    const shape = describe(j, 0);
    let text: string;
    if (Array.isArray(j)) {
      text = `JSON array with ${j.length} items. First items:\n${JSON.stringify(j.slice(0, 6), null, 2).slice(0, 6000)}`;
    } else {
      text = `JSON object. Keys: ${Object.keys(j as object).join(", ")}\n${JSON.stringify(j, null, 2).slice(0, 8000)}`;
    }
    return { shape, text };
  } catch (e) {
    return { shape: "invalid-json", text: `Invalid JSON: ${(e as Error).message}\nRaw start: ${raw.slice(0, 800)}` };
  }
}

function describe(v: unknown, depth: number): string {
  if (depth > 3) return "…";
  if (Array.isArray(v)) return `[${v.length}] of ${v.length ? describe(v[0], depth + 1) : "empty"}`;
  if (v && typeof v === "object") {
    const keys = Object.keys(v as object).slice(0, 14);
    return `{ ${keys.map((k) => `${k}: ${describe((v as Record<string, unknown>)[k], depth + 1)}`).join(", ")}${
      Object.keys(v as object).length > 14 ? ", …" : ""
    } }`;
  }
  return typeof v;
}

function summarizeCsv(raw: string): { shape: string; text: string } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0] ?? "";
  const cols = head.split(/[;,\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1, 9).join("\n");
  return {
    shape: `CSV · ${lines.length - 1} rows · ${cols.length} columns`,
    text: `Columns: ${cols.join(" | ")}\nTotal rows: ${Math.max(0, lines.length - 1)}\n\nFirst rows:\n${head}\n${rows}`,
  };
}

/** Cheap central-directory listing for ZIP files (no dependency). */
function listZip(buf: Uint8Array): string[] {
  const out: string[] = [];
  const dv = new DataView(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
  for (let i = 0; i + 4 < buf.length && out.length < 200; i++) {
    if (dv.getUint32(i, true) === 0x04034b50) {
      const nameLen = dv.getUint16(i + 26, true);
      const extraLen = dv.getUint16(i + 28, true);
      const size = dv.getUint32(i + 18, true);
      const name = new TextDecoder().decode(buf.subarray(i + 30, i + 30 + nameLen));
      if (name && !name.includes("\0")) out.push(`${name} (${size} bytes)`);
      i += 30 + nameLen + extraLen;
    }
  }
  return out;
}

/* ─────────────────────────── the fetcher ─────────────────────────── */

export type NetFetchOptions = {
  /** hard byte cap (defaults per kind) */
  maxBytes?: number;
  timeoutMs?: number;
  redirects?: number;
  /** return a data URL for small binary payloads (images/audio) */
  inline?: boolean;
  /** max chars of text kept in the result */
  textChars?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

export async function netFetch(raw: string, opts: NetFetchOptions = {}): Promise<NetFetchResult> {
  const t0 = Date.now();
  const timeoutMs = Math.min(60_000, opts.timeoutMs ?? 25_000);
  const maxBytes = opts.maxBytes ?? MAX_BINARY_BYTES;
  const textChars = opts.textChars ?? 60_000;
  let url: URL;
  try {
    url = await assertPublicUrl(raw);
  } catch (e) {
    return {
      ok: false, url: raw, finalUrl: raw, status: 0, kind: "unknown", mime: "", bytes: 0,
      ms: Date.now() - t0, text: "", error: (e as Error).message,
    };
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const onAbort = () => ctl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    let res = await fetch(url, {
      redirect: "manual",
      signal: ctl.signal,
      headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "ar,en;q=0.8,fr;q=0.7", ...(opts.headers ?? {}) },
      cache: "no-store",
    });
    let hops = 0;
    const maxRedirects = opts.redirects ?? 5;
    while (res.status >= 300 && res.status < 400 && res.headers.get("location") && hops < maxRedirects) {
      const next = new URL(res.headers.get("location") as string, res.url || url.href);
      await assertPublicUrl(next.href);
      res = await fetch(next, {
        redirect: "manual",
        signal: ctl.signal,
        headers: { "User-Agent": UA, Accept: "*/*", ...(opts.headers ?? {}) },
        cache: "no-store",
      });
      hops++;
    }

    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const kind = kindOf(mime, res.url || url.href);
    const lenHeader = Number(res.headers.get("content-length") ?? 0);
    const cap = kind === "image" || kind === "audio" || kind === "binary" || kind === "archive" ? maxBytes : MAX_TEXT_BYTES;
    if (lenHeader && lenHeader > cap) {
      return {
        ok: false, url: raw, finalUrl: res.url, status: res.status, kind, mime, bytes: lenHeader,
        ms: Date.now() - t0, text: "", error: `TOO_LARGE (${Math.round(lenHeader / 1048576)} MB > ${Math.round(cap / 1048576)} MB)`,
      };
    }

    const reader = res.body?.getReader();
    if (!reader) return { ok: false, url: raw, finalUrl: res.url, status: res.status, kind, mime, bytes: 0, ms: Date.now() - t0, text: "", error: "NO_BODY" };
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > cap) {
          await reader.cancel().catch(() => undefined);
          return {
            ok: false, url: raw, finalUrl: res.url, status: res.status, kind, mime, bytes: total,
            ms: Date.now() - t0, text: "", error: "TOO_LARGE",
          };
        }
        chunks.push(value);
      }
    }
    const buf = concat(chunks, total);
    const base: Omit<NetFetchResult, "text"> = {
      ok: res.ok, url: raw, finalUrl: res.url || url.href, status: res.status, kind, mime,
      bytes: total, ms: Date.now() - t0,
      headers: { "content-type": mime, "content-length": String(total) },
    };
    if (!res.ok) return { ...base, text: "", error: `HTTP_${res.status}` };

    switch (kind) {
      case "html": {
        const { title, text, links } = htmlToReadable(new TextDecoder("utf-8", { fatal: false }).decode(buf));
        return { ...base, title, text: text.slice(0, textChars), entries: links };
      }
      case "json": {
        const s = summarizeJson(new TextDecoder("utf-8", { fatal: false }).decode(buf));
        return { ...base, shape: s.shape, text: s.text.slice(0, textChars) };
      }
      case "csv": {
        const s = summarizeCsv(new TextDecoder("utf-8", { fatal: false }).decode(buf));
        return { ...base, shape: s.shape, text: s.text.slice(0, textChars) };
      }
      case "archive": {
        const entries = /\.zip$/i.test(url.pathname) || mime.includes("zip") ? listZip(buf) : [];
        return { ...base, entries, text: entries.length ? `Archive with ${entries.length} entries:\n${entries.join("\n")}` : `Binary archive (${total} bytes).` };
      }
      case "image":
      case "audio":
      case "video":
      case "pdf":
      case "binary": {
        const inline = opts.inline !== false && total <= 4_500_000 && kind !== "video";
        return {
          ...base,
          text: `${kind.toUpperCase()} file · ${(total / 1024).toFixed(1)} KB · ${mime}`,
          dataUrl: inline ? `data:${mime || "application/octet-stream"};base64,${toB64(buf)}` : undefined,
        };
      }
      default: {
        const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
        const printable = text.replace(/[^\P{C}\n\t]/gu, "").length / Math.max(1, text.length);
        if (printable > 0.85) return { ...base, kind: "text", text: text.slice(0, textChars) };
        return { ...base, text: `Binary file (${total} bytes, ${mime || "unknown type"}).` };
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false, url: raw, finalUrl: raw, status: 0, kind: "unknown", mime: "", bytes: 0,
      ms: Date.now() - t0, text: "", error: /abort/i.test(msg) ? "TIMEOUT" : msg.slice(0, 120),
    };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

function concat(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

function toB64(buf: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  let bin = "";
  for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...Array.from(buf.subarray(i, i + 8192)));
  return btoa(bin);
}

/* ─────────────────────────── URL discovery ─────────────────────────── */

/** Every http(s) URL in a text (used to auto-fetch what the user pasted). */
export function urlsIn(text: string, limit = 8): string[] {
  const out: string[] = [];
  const re = /https?:\/\/[^\s<>"'`)\]}\u0600-\u06FF]{4,}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < limit) {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/** True when the user clearly wants something fetched/downloaded from the web. */
const DOWNLOAD_RE =
  /(حم[ّل]{1,2}|تحميل|نزل|جيب|جيبلي|ابحث.{0,12}(صور|صوت|صوتيات|ملف|بيانات|معلومات)|صور من (الانترنت|النت)|صوت من الانترنت|ملف من الانترنت|dataset|بيانات|csv|json|download|fetch|grab|get me|find me (an )?(image|photo|sound|audio|file|dataset)|t[ée]l[ée]charge|r[ée]cup[èe]re|charge (une|un) (image|photo|audio|fichier))/i;

export function wantsInternet(text: string): boolean {
  if (!text) return false;
  if (urlsIn(text).length) return true;
  return DOWNLOAD_RE.test(text);
}

/** What kind of asset the user is after (drives the media finder). */
export function wantedAssetKind(text: string): "image" | "audio" | "data" | "document" | "any" {
  const t = (text || "").toLowerCase();
  if (/(صور|صورة|image|photo|picture|logo|خلفية|wallpaper|illustration|تصميم)/.test(t)) return "image";
  if (/(صوت|صوتيات|موسيق|audio|sound|music|mp3|voice|نغمة|مؤثر)/.test(t)) return "audio";
  if (/(بيانات|dataset|csv|json|إحصائ|statistic|data)/.test(t)) return "data";
  if (/(ملف|وثيق|document|pdf|contract|كتاب|book|تقرير|report)/.test(t)) return "document";
  return "any";
}
