import { NextResponse } from "next/server";
import { getContest } from "@/lib/contests";
import { decodeInlineImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** يعرض صورة المسابقة (تيليغرام والموقع يستخدمان نفس الرابط) */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contest = await getContest(id);
  const image = contest?.imageUrl;
  if (!image) return new NextResponse("no image", { status: 404 });

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return NextResponse.redirect(image, 302);
  }

  const decoded = decodeInlineImage(image);
  if (!decoded) return new NextResponse("bad image", { status: 400 });

  return new NextResponse(new Uint8Array(decoded.bytes), {
    status: 200,
    headers: {
      "content-type": decoded.mime,
      "content-length": String(decoded.bytes.length),
      "cache-control": "public, max-age=60, stale-while-revalidate=86400",
    },
  });
}
