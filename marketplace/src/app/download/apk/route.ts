import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Legacy download path kept working: serves the signed release APK that ships
 * in `public/DZ-Exchange.apk`. `?check=1` returns integrity metadata only.
 */
export async function GET(request: NextRequest) {
  const file = path.join(process.cwd(), "public", "DZ-Exchange.apk");
  let bytes: Buffer;
  try {
    bytes = await readFile(file);
  } catch {
    return NextResponse.json({ error: { code: "apk_unavailable" } }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (request.nextUrl.searchParams.has("check")) {
    return NextResponse.json({ ok: true, bytes: bytes.byteLength, sha256, file: "DZ-Exchange.apk" }, { headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Content-Disposition": 'attachment; filename="DZ-Exchange.apk"',
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "X-Apk-Sha256": sha256,
    },
  });
}
