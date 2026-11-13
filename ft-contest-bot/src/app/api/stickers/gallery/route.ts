import { NextResponse } from "next/server";
import { stickerGalleryHtml, EMOJI_SETS } from "@/lib/stickers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 🎭 معرض الملصقات: HTML حيّ (نفس الصور اللي كيصيفطهم البوت) + روابط النشر.
   `/api/stickers/gallery` — بلا سر، عام للعرض فقط. */
export async function GET() {
  try {
    const html = await stickerGalleryHtml(EMOJI_SETS.slice(0, 2));
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return new NextResponse(
      `<!doctype html><html dir="rtl"><meta charset="utf-8"><body style="font:15px system-ui;background:#0b0d12;color:#e8ecf4;padding:24px">🎭 ما لقيناه حتى ملصق دابا — جرّب من بعد. <br><small>${String(
        (error as Error)?.message || error,
      ).slice(0, 160)}</small></body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
}
