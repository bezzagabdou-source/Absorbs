import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { stickerGalleryHtml, describeStickers, EMOJI_SETS } from "@/lib/stickers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 🎭 صفحة الملصقات للوحة: `/api/panel/stickers?key=<PANEL_PUBLIC_KEY>`
   HTML حيّ (نفس الملصقات اللي كيصيفطهم البوت) + نشرات الإيموجي المخصّصة. */
function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const header = req.headers.get("x-panel-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const provided = Buffer.from(header || req.nextUrl.searchParams.get("key") || "");
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

const html = (body: string, status = 200) =>
  new NextResponse(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: NextRequest) {
  if (!authorized(req))
    return html(
      `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;background:#0b0d12;color:#e8ecf4;padding:24px">🔒 مفتاح اللوحة ماشي صحيح — استعمل <code>/api/panel/stickers?key=…</code></body>`,
      401,
    );
  if (req.nextUrl.searchParams.get("as") === "json") {
    return NextResponse.json({ ok: true, stickers: await describeStickers(), emojiPacks: EMOJI_SETS }, { headers: { "cache-control": "no-store" } });
  }
  return html(await stickerGalleryHtml(EMOJI_SETS.slice(0, 3), req.nextUrl.origin));
}
