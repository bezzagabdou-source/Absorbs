import { NextResponse } from "next/server";
import { ensureRewards, rewardImage } from "@/lib/rewards";
import { decodeInlineImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 🖼️ صورة الجائزة (رابط خارجي أو data URL داخلي) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rewards = await ensureRewards();
  const reward = rewards.find((r) => r.id === id);
  if (!reward) return new NextResponse("not found", { status: 404 });
  const image = rewardImage(reward);
  if (/^https?:\/\//i.test(image)) return NextResponse.redirect(image, 302);
  const decoded = decodeInlineImage(image);
  if (!decoded) return new NextResponse("bad image", { status: 400 });
  return new NextResponse(new Uint8Array(decoded.bytes), {
    status: 200,
    headers: {
      "content-type": decoded.mime,
      "content-length": String(decoded.bytes.length),
      "cache-control": "public, max-age=120, stale-while-revalidate=86400",
    },
  });
}
