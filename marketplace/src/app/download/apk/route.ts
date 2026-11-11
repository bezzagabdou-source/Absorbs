import { NextResponse, type NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readApkInfo } from "@/lib/server/apk";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Serves the signed release APK.
 * - `/download/apk` → the APK itself (attachment),
 * - `/download/apk?check=1` → integrity metadata only.
 *
 * A stable path is important for Uptodown and for users: the file behind it is
 * replaced by the Android build pipeline, the URL never changes.
 */
export async function GET(request: NextRequest) {
  const info = await readApkInfo();
  if (!info) return NextResponse.json({ error: { code: "apk_unavailable" } }, { status: 502, headers: { "Cache-Control": "no-store" } });
  if (request.nextUrl.searchParams.has("check")) {
    return NextResponse.json({ ok: true, version: info.versionName, versionCode: info.versionCode, bytes: info.bytes, sha256: info.sha256, file: info.file }, { headers: { "Cache-Control": "no-store" } });
  }
  let bytes: Buffer;
  try { bytes = await readFile(path.join(process.cwd(), "public", "app", info.file)); }
  catch { return NextResponse.json({ error: { code: "apk_unavailable" } }, { status: 502, headers: { "Cache-Control": "no-store" } }); }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": `attachment; filename="DZ-Exchange-${info.versionName}.apk"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Apk-Sha256": info.sha256,
      "X-Apk-Version": info.versionName,
    },
  });
}
