/**
 * NEXUS FORGE v19 — الرابط الحي
 * ---------------------------------------------------------------------------
 * GET /live/:slug            → the published project as a real HTML document
 *     ?zip=1                 → the whole tree as a downloadable .zip
 *     ?download=1            → index.html as a file
 *     ?src=1                 → the source as text/plain (view-source friendly)
 *     ?meta=1                → JSON metadata (title, size, models, views)
 *     ?file=css/styles.css   → one file of the tree
 *
 * Served inside a strict CSP sandbox: the site runs, but it lives in its own
 * origin and can never read the app's cookies, storage or Firebase session.
 */
import { json, serverError } from "@/lib/http";
import { getSite, isSlug } from "@/lib/live";
import { verifyRequest } from "@/lib/server-auth";
import { createZipBuffer } from "@/lib/zip-server";
import { sizeLabel } from "@/lib/atlas-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Runs the site, keeps it in its own origin, blocks any reach back into the app. */
const LIVE_CSP = [
  "sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock",
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://unpkg.com",
  "style-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
  "img-src * data: blob:",
  "media-src * data: blob:",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

const safeName = (s: string) => (s || "nexus-site").replace(/[^\w.\-\u0600-\u06FF]+/g, "_").slice(0, 100) || "nexus-site";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (!isSlug(slug)) return json(404, { code: "NOT_FOUND" });

  const u = new URL(req.url);
  try {
    const user = await verifyRequest(req).catch(() => null);
    const site = await getSite(slug, { owner: user?.uid, countView: !u.searchParams.get("meta") });
    if (!site) {
      return new Response(notFoundPage(slug), { status: 404, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }

    /* metadata */
    if (u.searchParams.get("meta") === "1") {
      return json(200, {
        slug: site.slug,
        title: site.title,
        kind: site.kind,
        language: site.language,
        bytes: site.bytes,
        size: sizeLabel(site.bytes),
        lines: site.lines,
        views: site.views,
        visibility: site.visibility,
        createdAt: site.createdAt,
        files: site.files.map((f) => ({ path: f.path, bytes: f.data.length })),
        models: site.models,
        urls: {
          live: `/live/${site.slug}`,
          zip: `/live/${site.slug}?zip=1`,
          download: `/live/${site.slug}?download=1`,
          source: `/live/${site.slug}?src=1`,
        },
      });
    }

    /* one file of the tree */
    const wanted = u.searchParams.get("file");
    if (wanted) {
      const f = site.files.find((x) => x.path === wanted.replace(/^\/+/, ""));
      if (!f) return json(404, { code: "NO_FILE" });
      const ext = (f.path.split(".").pop() ?? "").toLowerCase();
      const mime =
        ext === "css" ? "text/css; charset=utf-8"
        : ext === "js" ? "text/javascript; charset=utf-8"
        : ext === "json" || ext === "webmanifest" ? "application/json; charset=utf-8"
        : ext === "svg" ? "image/svg+xml"
        : ext === "md" || ext === "txt" ? "text/plain; charset=utf-8"
        : "text/html; charset=utf-8";
      return new Response(f.data, { headers: { "Content-Type": mime, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
    }

    /* ZIP of the whole project */
    if (u.searchParams.get("zip") === "1") {
      const items = [{ path: "index.html", data: site.html }, ...site.files.filter((f) => f.path !== "index.html")];
      const zip = createZipBuffer(items, `${site.title} — built by Nexus AI v19 FORGE (abdelrezakbezzag, Algeria)`);
      const name = `${safeName(site.title)}.zip`;
      return new Response(new Uint8Array(zip), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Length": String(zip.length),
          "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
          "Cache-Control": "private, max-age=60",
          "x-nexus": "v19-forge",
        },
      });
    }

    /* plain download */
    const download = u.searchParams.get("download") === "1";
    const src = u.searchParams.get("src") === "1";
    const name = `${safeName(site.title)}.html`;
    const bytes = Buffer.byteLength(site.html, "utf8");

    return new Response(site.html, {
      headers: {
        "Content-Type": src ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
        "Content-Length": String(bytes),
        "Content-Disposition": download ? `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}` : `inline; filename="${name}"`,
        "Cache-Control": site.visibility === "public" ? "public, max-age=120" : "private, max-age=60",
        ...(src ? {} : { "Content-Security-Policy": LIVE_CSP }),
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "x-nexus": "v19-forge",
        "x-forge-slug": site.slug,
        "x-forge-lines": String(site.lines),
        "x-forge-models": String(new Set(site.models.map((m) => m.label)).size),
      },
    });
  } catch (e) {
    return serverError("live:site", e);
  }
}

/** A friendly 404 that still looks like Nexus (never a bare browser error). */
function notFoundPage(slug: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>الرابط غير موجود — Nexus AI</title>
<style>
:root{--bg:#100f14;--surface:#1a1922;--text:#f4f3f7;--muted:#a5a2b3;--accent:#d97757;--accent2:#f5c451}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:radial-gradient(1200px 700px at 80% -10%,#2a1f18 0%,var(--bg) 60%);color:var(--text);font-family:system-ui,"Segoe UI","Noto Sans Arabic",sans-serif;padding:24px}
.card{max-width:520px;width:100%;background:linear-gradient(180deg,var(--surface),#141319);border:1px solid #ffffff14;border-radius:24px;padding:32px;box-shadow:0 40px 90px -50px #000}
h1{margin:0 0 8px;font-size:26px}.p{color:var(--muted);line-height:1.9;margin:0 0 22px;font-size:15px}
code{background:#00000055;padding:2px 8px;border-radius:8px;color:var(--accent2);font-size:13px;direction:ltr;display:inline-block}
a{display:inline-block;padding:12px 20px;border-radius:14px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#1a1206;text-decoration:none;font-weight:800}
.badge{font-size:12px;color:var(--muted);margin-top:20px}
</style>
</head>
<body>
<div class="card">
<h1>هذا الرابط لم يعد موجودًا</h1>
<p class="p">الموقع <code>${slug.replace(/[<>&"]/g, "")}</code> غير منشور أو تم حذفه.<br>ابنِ مشروعًا جديدًا من <b>Nexus Code</b> وسيحصل فورًا على رابط حي دائم.</p>
<a href="/app/code">افتح Nexus Code</a>
<div class="badge">Nexus AI v19 FORGE — من تطوير abdelrezakbezzag · الجزائر 🇩🇿</div>
</div>
</body>
</html>`;
}
