import { NextResponse } from "next/server";

/**
 * Viral share landing: social crawlers (WhatsApp/Telegram/Twitter) read the
 * Open Graph card; humans are instantly redirected into the app post page.
 * The excerpt/image travel in the URL (composed by the share button), so no
 * public DB access is needed for the preview card.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const rawTitle = (url.searchParams.get("t") ?? "شاهد هذا المنشور على Dz connect").slice(0, 140);
  const img = url.searchParams.get("img") ?? "";
  const origin = url.origin;
  const target = `${origin}/post/${id}`;
  const imgTag = img.startsWith("https://")
    ? `<meta property="og:image" content="${escapeHtml(img)}" /><meta name="twitter:image" content="${escapeHtml(img)}" />`
    : "";
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(rawTitle)} · Dz connect</title>
<meta name="description" content="${escapeHtml(rawTitle)} — على منصة Dz connect الاجتماعية 🇩🇿" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Dz connect" />
<meta property="og:title" content="${escapeHtml(rawTitle)}" />
<meta property="og:description" content="انضم إلى Dz connect: منشورات، قصص، مكالمات وذكاء اصطناعي — صُنع في الجزائر 🇩🇿" />
${imgTag}
<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}" />
<meta http-equiv="refresh" content="0; url=${target}" />
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body style="background:#040a08;color:#e7fff4;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
<p>جارٍ فتح المنشور في <b>Dz connect</b>… <a href="${target}" style="color:#34d399">اضغط هنا</a></p>
</body>
</html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
