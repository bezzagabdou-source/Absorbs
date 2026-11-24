import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { saveSnapshot } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ⏰ /api/cron/backup — نسخة احتياطية تلقائية يومية (vercel.json crons).
 * المصادقة: Authorization: Bearer CRON_SECRET أو ?key=CRON_SECRET|BACKUP_KEY
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || url.searchParams.get("key") || "";
  const allowed = [process.env.CRON_SECRET, process.env.BACKUP_KEY].map((v) => String(v || "").trim()).filter((v) => v.length >= 6);
  const valid =
    Boolean(given) &&
    allowed.some((key) => {
      const a = Buffer.from(key);
      const b = Buffer.from(given);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    });
  if (!valid) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const saved = await saveSnapshot("full");
  return NextResponse.json({ ok: true, ...saved });
}
