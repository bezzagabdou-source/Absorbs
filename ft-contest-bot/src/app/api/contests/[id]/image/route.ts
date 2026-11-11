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
  try {
  const { id } = await params;
  const contest = await getContest(id);
  const image = contest?.imageUrl;
  if (!image) return new NextResponse("no image", { status: 404 });

  if (image.startsWith("http://") || image.startsWith("https://")) {
    return NextResponse.redirect(image, 302);
  }

  const decoded = decodeInlineImage(image);
  if (!decoded) return new NextResponse("bad image", { status: 400 });

  const bin = atob(image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "").replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "content-type": decoded.mime,
      "content-length": String(bytes.length),
      "cache-control": "public, max-age=60, stale-while-revalidate=86400",
    },
  });
  } catch (error) {
    return new NextResponse(`err: ${String((error as Error)?.message || error)}`, { status: 500 });
  }
}
