import { NextResponse } from "next/server";
import { ensureRewards, rewardImage } from "@/lib/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 🖼️ صورة الجائزة (رابط خارجي أو data URL داخلي) */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rewards = await ensureRewards();
    const reward = rewards.find((r) => r.id === id);
    if (!reward) return new NextResponse("not found", { status: 404 });
    const image = rewardImage(reward);

    // رابط خارجي → تحويل
    if (/^https?:\/\//i.test(image)) return NextResponse.redirect(image, 302);

    // data URL → نفكّو بأيدينا (بلا ما نحتاجو Buffer)
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(image);
    if (!match) return new NextResponse("bad image", { status: 400 });
    const bin = atob(match[2].replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "content-type": match[1],
        "content-length": String(bytes.length),
        "cache-control": "public, max-age=120, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return new NextResponse(`err: ${String((error as Error)?.message || error)}`, { status: 500 });
  }
}
