import { findPublicProject } from "@/lib/apex/store";

export const runtime = "nodejs";

/**
 * GET /p/<slug> — the **live URL** of a generated project.
 *
 * The whole project is one self-contained HTML document (no CDN, no build step),
 * so this route simply streams it back with the right headers. Private projects
 * answer 404 to everyone but their owner (who uses the IDE preview instead).
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const embed = new URL(req.url).searchParams.get("embed") === "1";
  const project = await findPublicProject(slug);
  if (!project) {
    return new Response(
      `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>غير موجود</title>
<style>body{margin:0;font-family:system-ui,'Noto Sans Arabic',sans-serif;background:#0b0d14;color:#eef1f8;display:grid;place-items:center;height:100vh;text-align:center}
a{color:#d97757}</style></head>
<body><div><h1 style="font-size:3rem;margin:0">404</h1><p style="opacity:.7">المشروع غير موجود أو غير منشور.</p>
<p><a href="/app/code">← افتح NEXUS CODE</a></p></div></body></html>`,
      { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
    );
  }
  const headers: Record<string, string> = {
    "content-type": "text/html; charset=utf-8",
    "cache-control": embed ? "public, max-age=120" : "public, max-age=300, stale-while-revalidate=600",
    "x-nexus-apex": `${project.blueprint} · ${project.modules} modules · ${project.lines} lines`,
    "x-nexus-score": String(project.score),
    "x-robots-tag": project.visibility === "public" ? "index, follow" : "noindex",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self' 'unsafe-inline' data: blob:; img-src * data: blob:; frame-ancestors *",
  };
  return new Response(project.html, { status: 200, headers });
}
