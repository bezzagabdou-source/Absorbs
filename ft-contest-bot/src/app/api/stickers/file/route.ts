import { NextResponse, type NextRequest } from "next/server";
import { tgCall } from "@/lib/telegram";
import { knownStickerIds } from "@/lib/stickers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   🖼 وسيط آمن لملصقات تيليجرام: `/api/stickers/file?id=<file_id>`
   التوكن كيبقى في السيرفر: المتصفح كيقرا الصور من هاد الوسيط فقط.
   الأمان: كنقبلو غير الـ file_id اللي فمصدر الملصقات ديال البوت (cache).
   ══════════════════════════════════════════════════════════════════════════ */

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "id مطلوب" }, { status: 400 });
  const allow = await knownStickerIds();
  if (!allow.has(id)) return NextResponse.json({ ok: false, error: "ملصق غير معروف" }, { status: 404 });
  try {
    const res = await tgCall<{ file_path?: string }>("getFile", { file_id: id });
    const filePath = String(res.result?.file_path || "");
    if (!res.ok || !filePath) return NextResponse.json({ ok: false, error: res.description || "getFile فشل" }, { status: 404 });
    const token = String(process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "");
    const up = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, { cache: "force-cache" });
    if (!up.ok) return NextResponse.json({ ok: false, error: `HTTP ${up.status}` }, { status: 502 });
    const body = await up.arrayBuffer();
    const type = filePath.endsWith(".webp") ? "image/webp" : filePath.endsWith(".tgs") ? "application/x-tgs" : "application/octet-stream";
    return new NextResponse(body, {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=86400, immutable",
        "content-length": String(body.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String((error as Error)?.message || error) }, { status: 500 });
  }
}
