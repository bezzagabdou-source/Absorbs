/**
 * NEXUS FORGE v19 — الرابط الحي (live publishing)
 * ---------------------------------------------------------------------------
 * A finished build gets a permanent public URL: `/live/<slug>`.
 *
 * Two paths, always one of them works:
 *   1. DATABASE  — the project is stored in `barq.atlas_sites` and served by
 *      `/app/live/[slug]/route.ts` as a real HTML document (with ZIP download,
 *      view-source and stats). This is the normal path.
 *   2. PORTABLE  — when no database is configured, the whole project is
 *      deflate-compressed into the URL *fragment* (`/live/portable#d=…`).
 *      The fragment never reaches a server, so the link works anywhere, with no
 *      storage at all, and still opens the project instantly.
 *
 * Server-only (node:zlib, pg).
 */
import { pool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { siteUrl } from "@/lib/site";
import { byteLength, countLines, type ForgeKind, type ModelRef } from "@/lib/forge/types";
import { fileSlug, isSlug, packPortable, portableHref, slugify, unpackPortable } from "@/lib/live-pack";

export type SiteVisibility = "public" | "unlisted" | "private";

export type LiveSite = {
  slug: string;
  title: string;
  kind: string;
  language: string;
  bytes: number;
  lines: number;
  files: { path: string; data: string }[];
  models: ModelRef[];
  visibility: SiteVisibility;
  views: number;
  createdAt: string;
  updatedAt: string;
};

export type PublishInput = {
  userId: string;
  title: string;
  kind?: ForgeKind | string;
  language?: string;
  html: string;
  files?: { path: string; data: string }[];
  models?: ModelRef[];
  visibility?: SiteVisibility;
  /** reuse this slug instead of minting a new one (an update) */
  slug?: string;
};

export type PublishResult =
  | { ok: true; slug: string; url: string; mode: "db"; bytes: number; lines: number }
  | { ok: true; slug: string; url: string; mode: "portable"; bytes: number; lines: number; note: string }
  | { ok: false; code: "TOO_LARGE" | "NO_HTML" | "QUOTA" | "DB"; detail: string };

const MAX_SITE_BYTES = 8_000_000;
const MAX_SITES_PER_USER = 200;

export { isSlug, slugify, fileSlug, packPortable, unpackPortable };

export function liveUrl(slug: string): string {
  return `${siteUrl()}/live/${slug}`;
}

/* ------------------------------------------------------------------ *
 * portable link (no database needed)
 * ------------------------------------------------------------------ */
/** A shareable link that carries the whole project inside the URL fragment. */
export function portableLink(html: string, title: string) {
  return portableHref(siteUrl(), html, title);
}

/* ------------------------------------------------------------------ *
 * database path
 * ------------------------------------------------------------------ */
async function dbReady(): Promise<boolean> {
  try {
    await ensureSchema();
    return true;
  } catch {
    return false;
  }
}

/** Publishes (or updates) a build. Falls back to a portable link when there is no DB. */
export async function publishSite(input: PublishInput): Promise<PublishResult> {
  const html = (input.html ?? "").trim();
  if (!html) return { ok: false, code: "NO_HTML", detail: "لا يوجد ملف للنشر" };
  const bytes = byteLength(html);
  if (bytes > MAX_SITE_BYTES) return { ok: false, code: "TOO_LARGE", detail: `الملف ${(bytes / 1048576).toFixed(1)} MB — الحد ${(MAX_SITE_BYTES / 1048576).toFixed(0)} MB` };

  const title = (input.title || "مشروع Nexus").slice(0, 120);
  const slug = input.slug && isSlug(input.slug) ? input.slug : slugify(title);
  const files = (input.files ?? []).filter((f) => f && f.path && typeof f.data === "string").slice(0, 200);
  const models = (input.models ?? []).slice(0, 60);

  if (!(await dbReady())) {
    const p = portableLink(html, title);
    return {
      ok: true,
      slug,
      url: p.url,
      mode: "portable",
      bytes,
      lines: countLines(html),
      note: "لا توجد قاعدة بيانات — الرابط يحمل المشروع كاملًا داخله (يعمل بلا تخزين)",
    };
  }

  try {
    const count = await pool.query(`select count(*)::int as n from barq.atlas_sites where user_id = $1`, [input.userId]);
    if (Number(count.rows[0]?.n ?? 0) >= MAX_SITES_PER_USER) {
      return { ok: false, code: "QUOTA", detail: `وصلت إلى ${MAX_SITES_PER_USER} موقع منشور — احذف واحدًا أولًا` };
    }

    await pool.query(
      `insert into barq.atlas_sites (slug, user_id, title, kind, language, html, files, bytes, lines, models, visibility)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11)
       on conflict (slug) do update set
         title = excluded.title,
         kind = excluded.kind,
         language = excluded.language,
         html = excluded.html,
         files = excluded.files,
         bytes = excluded.bytes,
         lines = excluded.lines,
         models = excluded.models,
         visibility = excluded.visibility,
         updated_at = now()`,
      [
        slug,
        input.userId,
        title,
        (input.kind ?? "site").slice(0, 20),
        (input.language ?? "ar").slice(0, 6),
        html,
        JSON.stringify(files),
        bytes,
        countLines(html),
        JSON.stringify(models),
        input.visibility === "private" || input.visibility === "unlisted" ? input.visibility : "public",
      ]
    );
    return { ok: true, slug, url: liveUrl(slug), mode: "db", bytes, lines: countLines(html) };
  } catch (e) {
    // the DB failed mid-flight: still give the user a working link
    const p = portableLink(html, title);
    return {
      ok: true,
      slug,
      url: p.url,
      mode: "portable",
      bytes,
      lines: countLines(html),
      note: `تعذّر الحفظ في القاعدة (${(e as Error).message?.slice(0, 80) ?? "error"}) — استعمل الرابط المحمول`,
    };
  }
}

type Row = {
  slug: string;
  user_id: string;
  title: string;
  kind: string;
  language: string;
  html?: string;
  files: { path: string; data: string }[] | null;
  bytes: number;
  lines: number;
  models: ModelRef[] | null;
  visibility: string;
  views: number;
  created_at: Date | string;
  updated_at: Date | string;
};

const iso = (v: Date | string) => (v instanceof Date ? v.toISOString() : String(v));

function rowOut(r: Row, withHtml = false): LiveSite & { html?: string; userId?: string } {
  return {
    slug: r.slug,
    title: r.title,
    kind: r.kind,
    language: r.language,
    bytes: r.bytes,
    lines: r.lines,
    files: Array.isArray(r.files) ? r.files : [],
    models: Array.isArray(r.models) ? r.models : [],
    visibility: (r.visibility as SiteVisibility) ?? "public",
    views: r.views,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    ...(withHtml ? { html: r.html ?? "" } : {}),
  };
}

/** Reads one site (+1 view). `owner` bypasses the visibility check. */
export async function getSite(slug: string, opts: { owner?: string; countView?: boolean } = {}): Promise<(LiveSite & { html: string; userId: string }) | null> {
  if (!isSlug(slug)) return null;
  if (!(await dbReady())) return null;
  try {
    const r = await pool.query(
      `select slug, user_id, title, kind, language, html, files, bytes, lines, models, visibility, views, created_at, updated_at
         from barq.atlas_sites where slug = $1 limit 1`,
      [slug]
    );
    const row = r.rows[0] as (Row & { html: string }) | undefined;
    if (!row) return null;
    const isOwner = !!opts.owner && opts.owner === row.user_id;
    if (row.visibility === "private" && !isOwner) return null;
    if (opts.countView !== false) {
      pool.query(`update barq.atlas_sites set views = views + 1 where slug = $1`, [slug]).catch(() => undefined);
    }
    return { ...(rowOut(row, true) as LiveSite & { html: string }), html: row.html, userId: row.user_id };
  } catch {
    return null;
  }
}

export async function listSites(userId: string, limit = 50): Promise<LiveSite[]> {
  if (!(await dbReady())) return [];
  try {
    const r = await pool.query(
      `select slug, user_id, title, kind, language, files, bytes, lines, models, visibility, views, created_at, updated_at
         from barq.atlas_sites where user_id = $1 order by created_at desc limit $2`,
      [userId, Math.min(200, Math.max(1, limit))]
    );
    return (r.rows as Row[]).map((x) => rowOut(x));
  } catch {
    return [];
  }
}

/** Trending public sites (used by the Nexus Code gallery). */
export async function gallery(limit = 24): Promise<LiveSite[]> {
  if (!(await dbReady())) return [];
  try {
    const r = await pool.query(
      `select slug, user_id, title, kind, language, files, bytes, lines, models, visibility, views, created_at, updated_at
         from barq.atlas_sites where visibility = 'public'
         order by views desc, created_at desc limit $1`,
      [Math.min(60, Math.max(1, limit))]
    );
    return (r.rows as Row[]).map((x) => rowOut(x));
  } catch {
    return [];
  }
}

export async function setSiteVisibility(userId: string, slug: string, visibility: SiteVisibility): Promise<boolean> {
  if (!(await dbReady())) return false;
  try {
    const r = await pool.query(
      `update barq.atlas_sites set visibility = $3, updated_at = now() where slug = $1 and user_id = $2`,
      [slug, userId, visibility]
    );
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function deleteSite(userId: string, slug: string): Promise<boolean> {
  if (!(await dbReady())) return false;
  try {
    const r = await pool.query(`delete from barq.atlas_sites where slug = $1 and user_id = $2`, [slug, userId]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}
