import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const APK_URL = "https://github.com/bezzagabdou-source/Absorbs/releases/download/android-v3/DZ-Exchange.apk";

export async function GET(request: NextRequest) {
  const upstream = await fetch(APK_URL, { redirect: "follow", cache: "no-store", headers: { "User-Agent": "dz-exchange-apk-download" } });
  if (!upstream.ok) return NextResponse.json({ error: { code: "apk_unavailable" } }, { status: 502, headers: { "Cache-Control": "no-store" } });
  if (request.nextUrl.searchParams.has("check")) {
    const bytes = Buffer.from(await upstream.arrayBuffer());
    return NextResponse.json({ ok: true, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex"), source: APK_URL }, { headers: { "Cache-Control": "no-store" } });
  }
  const headers = new Headers({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": 'attachment; filename="DZ-Exchange.apk"',
    "Cache-Control": "public, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new NextResponse(upstream.body, { status: 200, headers });
}
