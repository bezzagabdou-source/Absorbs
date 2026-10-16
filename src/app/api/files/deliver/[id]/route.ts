import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";
import { pool } from "@/db";
import { createZipBuffer } from "@/lib/zip-server";
import { fileKindMeta, sizeLabel, type FileKind } from "@/lib/atlas-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * v18 ATLAS — تسليم الملفات: معاينة · تنزيل · ZIP · رابط مشاركة.
 *
 *   GET /api/files/deliver/:id
 *     ?mode=preview   → inline, inside a *unique-origin* sandbox (CSP sandbox
 *                       without allow-same-origin): a served HTML file can run
 *                       but can never read the app's storage or cookies.
 *     ?mode=download  → Content-Disposition: attachment (default)
 *     ?zip=1          → the file + its extras packed as a real .zip
 *     ?meta=1         → JSON metadata only
 *
 *   Private files need their owner's Firebase token. `visibility='unlisted'`
 *   files are served to anyone with the id (public share link) — text, HTML,
 *   SVG, JSON, CSV and ZIP only, never with the app's own permissions.
 */

type Row = {
  id: string;
  user_id: string;
  title: string;
  kind: string;
  filename: string;
  mime: string;
  content: string;
  bytes: number;
  extras: { path: string; data: string }[] | null;
  visibility: string;
  views: number;
  downloads: number;
  created_at: Date | string;
};

/** A CSP that lets the file render but keeps it in its own origin. */
const SANDBOX_CSP = [
  "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads",
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com",
  "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

function filenameFor(row: Row, asZip: boolean): string {
  const base = (row.filename || "nexus-file").replace(/[^\w.\-\u0600-\u06FF]+/g, "_").slice(0, 120);
  return asZip ? base.replace(/\.[^.]+$/, "") + ".zip" : base;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? "")) {
    return json(404, { code: "NOT_FOUND" });
  }
  const u = new URL(req.url);
  const asZip = u.searchParams.get("zip") === "1";
  const meta = u.searchParams.get("meta") === "1";
  const preview = u.searchParams.get("mode") === "preview";

  try {
    await ensureSchema();
    const r = await pool.query(
      `select id, user_id, title, kind, filename, mime, content, bytes, extras, visibility, views, downloads, created_at
         from barq.atlas_files where id = $1 limit 1`,
      [id]
    );
    const row = r.rows[0] as Row | undefined;
    if (!row) return json(404, { code: "NOT_FOUND" });

    /* access control */
    if (row.visibility !== "unlisted") {
      const user = await verifyRequest(req);
      if (!user || user.uid !== row.user_id) return json(403, { code: "FORBIDDEN" });
    }

    if (meta) {
      return json(200, {
        id: row.id,
        title: row.title,
        kind: row.kind,
        filename: row.filename,
        mime: row.mime,
        bytes: row.bytes,
        size: sizeLabel(row.bytes),
        extras: (row.extras ?? []).map((e) => ({ path: e.path, bytes: e.data.length })),
        visibility: row.visibility,
        views: row.views,
        downloads: row.downloads,
        createdAt: typeof row.created_at === "string" ? row.created_at : row.created_at.toISOString(),
        urls: {
          preview: `/api/files/deliver/${row.id}?mode=preview`,
          download: `/api/files/deliver/${row.id}?mode=download`,
          zip: `/api/files/deliver/${row.id}?zip=1`,
        },
      });
    }

    /* ZIP delivery */
    if (asZip || (row.extras ?? []).length) {
      const items = [
        { path: row.kind === "zip" ? "index.html" : row.filename || "index.html", data: row.content },
        ...(row.extras ?? []).map((e) => ({ path: e.path, data: e.data })),
      ];
      if (!(row.extras ?? []).length) {
        items.push({
          path: "README.md",
          data: `# ${row.title}\n\nمولَّد بواسطة Nexus AI v18 ATLAS — من تطوير abdelrezakbezzag (الجزائر 🇩🇿).\n\n## التشغيل\nافتح \`${items[0].path}\` في أي متصفح.\n`,
        });
      }
      const zip = createZipBuffer(items);
      void pool
        .query(`update barq.atlas_files set downloads = downloads + 1 where id = $1`, [row.id])
        .catch(() => undefined);
      return new Response(new Uint8Array(zip), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(zip.length),
          "Content-Disposition": `attachment; filename="${filenameFor(row, true)}"; filename*=UTF-8''${encodeURIComponent(filenameFor(row, true))}`,
          "Cache-Control": "private, max-age=60",
          "x-atlas-file": row.id,
        },
      });
    }

    /* plain delivery */
    const kind = row.kind as FileKind;
    const mime = row.mime || fileKindMeta(kind).mime;
    const bytes = Buffer.byteLength(row.content, "utf8");
    void pool
      .query(`update barq.atlas_files set ${preview ? "views" : "downloads"} = ${preview ? "views" : "downloads"} + 1 where id = $1`, [row.id])
      .catch(() => undefined);

    const name = filenameFor(row, false);
    return new Response(row.content, {
      headers: {
        "Content-Type": mime,
        "Content-Length": String(bytes),
        "Content-Disposition": preview
          ? `inline; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`
          : `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": row.visibility === "unlisted" ? "public, max-age=300" : "private, max-age=60",
        "Content-Security-Policy": SANDBOX_CSP,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cross-Origin-Resource-Policy": "same-origin",
        "x-atlas-file": row.id,
        "x-atlas-kind": kind,
      },
    });
  } catch (e) {
    return serverError("files:deliver", e);
  }
}
