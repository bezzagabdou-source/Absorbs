/**
 * NEXUS ATLAS — جالب الوسائط من الإنترنت (v18)
 * ---------------------------------------------------------------------------
 * "جيبلي صور من الإنترنت" / "نزل لي صوت" / "جيب بيانات" — this module finds
 * real, openly-licensed assets online, downloads them and stores them in the
 * user's vault so the model (and the media hub UI) can use them.
 *
 * Sources, in order of preference (no key required):
 *   · Openverse        https://api.openverse.org/v1/{images,audio}/  (CC + public domain)
 *   · Wikimedia Commons MediaWiki API (needs a descriptive User-Agent)
 *   · Internet Archive  advancedsearch API (any media type)
 *   · Pixabay / Pexels / Freesound — used automatically when the matching
 *     environment key exists (PIXABAY_KEY, PEXELS_API_KEY, FREESOUND_TOKEN)
 */
import { netFetch, type NetFetchResult } from "@/lib/net/fetch";

export type MediaKind = "image" | "audio" | "data" | "document";

export type MediaAsset = {
  id: string;
  kind: MediaKind;
  title: string;
  /** direct file URL */
  url: string;
  /** small preview URL (images) */
  thumb?: string;
  source: string;
  author?: string;
  license?: string;
  /** ready-to-print credit line */
  attribution?: string;
  page?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  mime?: string;
};

const env = (k: string): string => (process.env[k] ?? "").trim().replace(/^["'`]+|["'`]+$/g, "").trim();
const UA = "NexusAtlas/18.0 (Algerian AI assistant; contact: abdelrezakbezzag) fetch/1.0";

async function getJson(url: string, ms = 12_000): Promise<unknown | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const slug = (s: string) =>
  (s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "asset";

/* ═══════════════════════════════ Openverse ═══════════════════════════════ */

async function openverse(q: string, kind: "image" | "audio", n: number): Promise<MediaAsset[]> {
  const lic = "&license_type=all";
  const url = `https://api.openverse.org/v1/${kind === "audio" ? "audio" : "images"}/?q=${encodeURIComponent(q)}&page_size=${Math.min(20, n)}${lic}`;
  const j = (await getJson(url)) as {
    results?: {
      id?: string;
      title?: string;
      url?: string;
      thumbnail?: string;
      foreign_landing_url?: string;
      creator?: string;
      license?: string;
      license_version?: string;
      attribution?: string;
      width?: number;
      height?: number;
      duration?: number;
    }[];
  } | null;
  const out: MediaAsset[] = [];
  for (const r of j?.results ?? []) {
    if (!r.url) continue;
    out.push({
      id: `openverse-${r.id ?? slug(r.url)}`,
      kind,
      title: (r.title || q).slice(0, 160),
      url: r.url,
      thumb: r.thumbnail,
      source: "Openverse",
      author: r.creator || undefined,
      license: r.license ? `${r.license.toUpperCase()} ${r.license_version ?? ""}`.trim() : undefined,
      attribution: r.attribution || (r.creator ? `${r.title ?? ""} by ${r.creator} (${r.license ?? "CC"})` : undefined),
      page: r.foreign_landing_url,
      width: r.width,
      height: r.height,
      durationMs: typeof r.duration === "number" ? r.duration : undefined,
    });
    if (out.length >= n) break;
  }
  return out;
}

/* ═══════════════════════════ Wikimedia Commons ═══════════════════════════ */

async function commons(q: string, kind: MediaKind, n: number): Promise<MediaAsset[]> {
  const ext =
    kind === "audio" ? " (filetype:audio OR filemp3 OR fileogg OR filewav)" : kind === "document" ? " (filetype:pdf OR filetype:djvu)" : "";
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search` +
    `&gsrsearch=${encodeURIComponent(q + ext)}&gsrnamespace=6&gsrlimit=${Math.min(20, n * 2)}` +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=480`;
  const j = (await getJson(url)) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: {
            url?: string;
            thumburl?: string;
            mime?: string;
            width?: number;
            height?: number;
            size?: number;
            extmetadata?: {
              Artist?: { value?: string };
              LicenseShortName?: { value?: string };
              Attribution?: { value?: string };
            };
          }[];
        }
      >;
    };
  } | null;
  const out: MediaAsset[] = [];
  for (const p of Object.values(j?.query?.pages ?? {})) {
    const info = p.imageinfo?.[0];
    if (!info?.url) continue;
    const mime = info.mime ?? "";
    const detected: MediaKind = mime.startsWith("image/")
      ? "image"
      : mime.startsWith("audio/")
        ? "audio"
        : mime.startsWith("video/")
          ? "document"
          : mime === "application/pdf"
            ? "document"
            : kind;
    if (detected !== kind && kind !== "data") continue;
    const strip = (s?: string) => (s ? s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().slice(0, 140) : undefined);
    out.push({
      id: `commons-${slug(p.title ?? info.url)}`,
      kind,
      title: (p.title ?? "").replace(/^File:/, "").slice(0, 160),
      url: info.url,
      thumb: info.thumburl,
      source: "Wikimedia Commons",
      author: strip(info.extmetadata?.Artist?.value),
      license: strip(info.extmetadata?.LicenseShortName?.value),
      attribution: strip(info.extmetadata?.Attribution?.value),
      page: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title ?? "")}`,
      bytes: info.size,
      width: info.width,
      height: info.height,
      mime,
    });
    if (out.length >= n) break;
  }
  return out;
}

/* ═══════════════════════════ Internet Archive ═══════════════════════════ */

async function archive(q: string, kind: MediaKind, n: number): Promise<MediaAsset[]> {
  const mediatype = kind === "audio" ? "audio" : kind === "image" ? "image" : "texts";
  const url =
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}+AND+mediatype:(${mediatype})` +
    `&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&fl%5B%5D=licenseurl&rows=${Math.min(15, n)}&page=1&output=json`;
  const j = (await getJson(url)) as {
    response?: { docs?: { identifier?: string; title?: string | string[]; creator?: string | string[]; licenseurl?: string }[] };
  } | null;
  const out: MediaAsset[] = [];
  for (const d of j?.response?.docs ?? []) {
    if (!d.identifier) continue;
    const meta = (await getJson(`https://archive.org/metadata/${d.identifier}`, 9_000)) as {
      files?: { name?: string; format?: string; size?: string; mime?: string }[];
    } | null;
    const wanted =
      kind === "audio"
        ? /\.(mp3|ogg|m4a|flac|wav)$/i
        : kind === "image"
          ? /\.(jpg|jpeg|png|gif|webp)$/i
          : /\.(pdf|epub|txt|djvu|csv|json)$/i;
    const file = (meta?.files ?? []).find((f) => f.name && wanted.test(f.name) && !/_thumb|_sample/i.test(f.name));
    if (!file?.name) continue;
    out.push({
      id: `archive-${d.identifier}-${slug(file.name)}`,
      kind,
      title: String(Array.isArray(d.title) ? d.title[0] : d.title ?? d.identifier).slice(0, 160),
      url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(file.name)}`,
      source: "Internet Archive",
      author: String(Array.isArray(d.creator) ? d.creator[0] : d.creator ?? ""),
      license: d.licenseurl,
      page: `https://archive.org/details/${d.identifier}`,
      bytes: Number(file.size ?? 0) || undefined,
      mime: file.mime,
    });
    if (out.length >= n) break;
  }
  return out;
}

/* ═══════════════════════════ keyed providers ═══════════════════════════ */

async function pixabay(q: string, kind: "image" | "audio", n: number): Promise<MediaAsset[]> {
  const key = env("PIXABAY_KEY");
  if (!key) return [];
  const url =
    kind === "audio"
      ? `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&per_page=${Math.min(20, n)}`
      : `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(q)}&image_type=photo&per_page=${Math.min(20, n)}&safesearch=true`;
  const j = (await getJson(url)) as {
    hits?: {
      id?: number;
      user?: string;
      tags?: string;
      largeImageURL?: string;
      previewURL?: string;
      webformatURL?: string;
      imageWidth?: number;
      imageHeight?: number;
      duration?: number;
    }[];
  } | null;
  return (j?.hits ?? []).slice(0, n).map((h) => ({
    id: `pixabay-${h.id ?? slug(h.largeImageURL ?? "")}`,
    kind,
    title: (h.tags || q).slice(0, 160),
    url: h.largeImageURL ?? h.webformatURL ?? "",
    thumb: h.previewURL,
    source: "Pixabay",
    author: h.user,
    license: "Pixabay Content License",
    attribution: `${h.tags ?? ""} — ${h.user ?? "Pixabay"} (Pixabay Content License)`,
    width: h.imageWidth,
    height: h.imageHeight,
    durationMs: typeof h.duration === "number" ? h.duration * 1000 : undefined,
  })).filter((a) => a.url);
}

async function pexels(q: string, n: number): Promise<MediaAsset[]> {
  const key = env("PEXELS_API_KEY");
  if (!key) return [];
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${Math.min(20, n)}`, {
      headers: { Authorization: key, "User-Agent": UA },
      signal: ctl.signal,
      cache: "no-store",
    });
    if (!r.ok) return [];
    const data = (await r.json()) as {
      photos?: { id?: number; alt?: string; photographer?: string; src?: { original?: string; medium?: string; tiny?: string }; width?: number; height?: number }[];
    };
    return (data.photos ?? []).slice(0, n).map((p) => ({
      id: `pexels-${p.id ?? slug(p.alt ?? "")}`,
      kind: "image" as MediaKind,
      title: (p.alt || q).slice(0, 160),
      url: p.src?.original ?? "",
      thumb: p.src?.tiny ?? p.src?.medium,
      source: "Pexels",
      author: p.photographer,
      license: "Pexels License",
      attribution: `${p.alt ?? ""} — ${p.photographer ?? "Pexels"} (Pexels License)`,
      width: p.width,
      height: p.height,
    })).filter((a) => a.url);
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

async function freesound(q: string, n: number): Promise<MediaAsset[]> {
  const token = env("FREESOUND_TOKEN");
  if (!token) return [];
  const url = `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&page_size=${Math.min(15, n)}&fields=id,name,username,license,previews,downloads,duration&token=${token}`;
  const j = (await getJson(url)) as {
    results?: {
      id?: number;
      name?: string;
      username?: string;
      license?: string;
      duration?: number;
      previews?: { "preview-hq-mp3"?: string; "preview-lq-mp3"?: string };
    }[];
  } | null;
  return (j?.results ?? []).slice(0, n).map((r) => ({
    id: `freesound-${r.id ?? slug(r.name ?? "")}`,
    kind: "audio" as MediaKind,
    title: (r.name || q).slice(0, 160),
    url: r.previews?.["preview-hq-mp3"] ?? r.previews?.["preview-lq-mp3"] ?? "",
    thumb: r.previews?.["preview-lq-mp3"],
    source: "Freesound",
    author: r.username,
    license: r.license,
    attribution: `${r.name ?? ""} by ${r.username ?? "Freesound"} (${r.license ?? "CC"})`,
    durationMs: typeof r.duration === "number" ? Math.round(r.duration * 1000) : undefined,
  })).filter((a) => a.url);
}

/* ═══════════════════════════ orchestration ═══════════════════════════ */

export type FindMediaOptions = {
  query: string;
  kind?: MediaKind;
  limit?: number;
  /** run the sources in parallel (default) or one after another */
  fast?: boolean;
  signal?: AbortSignal;
};

/** Finds openly-licensed assets from several sources at once, de-duplicated. */
export async function findMedia(o: FindMediaOptions): Promise<MediaAsset[]> {
  const q = (o.query ?? "").trim();
  if (!q) return [];
  const kind = o.kind ?? "image";
  const n = Math.min(30, Math.max(1, o.limit ?? 8));
  const jobs: Promise<MediaAsset[]>[] = [];

  if (kind === "image") {
    jobs.push(openverse(q, "image", n), pixabay(q, "image", n), pexels(q, n), commons(q, "image", n), archive(q, "image", Math.ceil(n / 2)));
  } else if (kind === "audio") {
    jobs.push(openverse(q, "audio", n), freesound(q, n), pixabay(q, "audio", n), commons(q, "audio", n), archive(q, "audio", Math.ceil(n / 2)));
  } else if (kind === "document") {
    jobs.push(commons(q, "document", n), archive(q, "document", n));
  } else {
    jobs.push(archive(q, "data", n), commons(q, "data", n));
  }

  const settled = await Promise.all(jobs.map((p) => p.catch(() => [] as MediaAsset[])));
  const all = settled.flat();
  const seen = new Set<string>();
  const out: MediaAsset[] = [];
  for (const a of all) {
    if (!a.url || seen.has(a.url)) continue;
    seen.add(a.url);
    out.push(a);
  }
  // keyed providers first (better quality), then openverse, then the rest
  const rank = (a: MediaAsset) => (a.source === "Pexels" || a.source === "Pixabay" ? 0 : a.source === "Openverse" ? 1 : a.source === "Freesound" ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, n);
}

/** Downloads one asset (safe fetch) and returns bytes as a base64 data URL or text. */
export async function downloadAsset(a: MediaAsset, maxBytes = 12_000_000): Promise<{ ok: boolean; res: NetFetchResult; dataUrl?: string }> {
  const res = await netFetch(a.url, { maxBytes, inline: true, textChars: 60_000 });
  return { ok: res.ok, res, dataUrl: res.dataUrl };
}

/** Ready-to-print credit line (the app always shows it with downloaded media). */
export function attributionLine(a: MediaAsset): string {
  if (a.attribution) return a.attribution;
  const parts = [a.title, a.author && `by ${a.author}`, a.license && `(${a.license})`, a.source && `via ${a.source}`].filter(Boolean);
  return parts.join(" ");
}

/** Markdown block handed to the model after a successful download. */
export function mediaBlock(assets: MediaAsset[], note?: string): string {
  if (!assets.length) return "";
  const lines = assets.map(
    (a, i) => `${i + 1}. [${a.kind}] ${a.title}\n   url: ${a.url}\n   credit: ${attributionLine(a)}${a.page ? `\n   page: ${a.page}` : ""}`
  );
  return `\n\nINTERNET ASSETS FETCHED (${assets.length})${note ? ` — ${note}` : ""}:\n${lines.join("\n")}\nUse these real URLs/credits in the answer; never invent an image or sound URL.`;
}
