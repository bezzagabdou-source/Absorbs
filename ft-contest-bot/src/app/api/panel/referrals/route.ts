import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { recentReferrals } from "@/lib/referrals";
import { getPointsConfig, savePointsConfig } from "@/lib/rewards";
import { getSettings } from "@/lib/settings";
import { currentBotToken, isMock, runWithBotToken, secondBotToken, tgCall } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.PANEL_PUBLIC_KEY || "";
  const raw = req.headers.get("x-panel-key") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(raw);
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

type PhotoSizes = { photos?: { file_id: string }[][] };

/** يرجع بيانات الملف فقط داخل الخادم: التوكن لا يظهر للمتصفح أو اللوحة. */
async function findPhoto(userId: string): Promise<{ token: string; path: string } | null> {
  const photos = await tgCall<PhotoSizes>("getUserProfilePhotos", { user_id: Number(userId), limit: 1 });
  const sizes = photos.result?.photos?.[0] || [];
  const fileId = sizes[0]?.file_id; // thumbnail keeps panel requests small
  if (!photos.ok || !fileId) return null;
  const file = await tgCall<{ file_path?: string }>("getFile", { file_id: fileId });
  const path = file.result?.file_path || "";
  // Telegram وحده يحدد المسار، ولا نسمح بمسار اعتباطي أو URL خارجي.
  if (!file.ok || !/^[A-Za-z0-9_./-]+$/.test(path) || path.includes("..")) return null;
  const token = currentBotToken() || (await getSettings()).botToken;
  return token ? { token, path } : null;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  if (url.searchParams.get("config") === "1") {
    const config = await getPointsConfig();
    return NextResponse.json({ ok: true, perJoin: config.perJoin, enabled: config.enabled }, { headers: { "cache-control": "no-store" } });
  }
  const photoId = url.searchParams.get("photo");
  if (photoId !== null) {
    if (!/^\d{1,20}$/.test(photoId)) return new NextResponse(null, { status: 400 });
    if (isMock()) return new NextResponse(null, { status: 404 });
    try {
      let file = await findPhoto(photoId);
      const second = secondBotToken();
      if (!file && second) file = await runWithBotToken(second, () => findPhoto(photoId));
      if (!file) return new NextResponse(null, { status: 404 });
      const response = await fetch(`https://api.telegram.org/file/bot${file.token}/${file.path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      const mime = response.headers.get("content-type") || "";
      const length = Number(response.headers.get("content-length") || 0);
      if (!response.ok || !mime.startsWith("image/") || length > 5_000_000) return new NextResponse(null, { status: 404 });
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 5_000_000) return new NextResponse(null, { status: 413 });
      return new NextResponse(bytes, { headers: { "content-type": mime, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" } });
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }
  const limit = Number(url.searchParams.get("limit") || 200);
  const referrals = await recentReferrals(limit);
  return NextResponse.json({ ok: true, referrals }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const input = await request.json().catch(() => ({}));
  const value = input?.perJoin;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
    return NextResponse.json({ ok: false, error: "نقاط الإحالة يجب أن تكون عدداً من 0 إلى 1000" }, { status: 400 });
  }
  // Only update perJoin; preserve every other shop setting.
  const config = await savePointsConfig({ perJoin: value });
  return NextResponse.json({ ok: true, perJoin: config.perJoin, enabled: config.enabled }, { headers: { "cache-control": "no-store" } });
}
