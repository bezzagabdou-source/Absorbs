import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { BACKUP_VERSION, buildBackup, latestSnapshot, saveSnapshot } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 💾 /api/panel/backup
 *   GET  ?key=KEY[&mode=full|meta][&latest=1]  → نسخة جاهزة للتحميل (JSON)
 *   POST ?key=KEY[&mode=full|meta]             → تخزين نسخة داخل قاعدة البيانات (آخر 5)
 *
 * المفتاح: BACKUP_KEY أو DIAG_KEY أو ADMIN_SECRET أو PANEL_PUBLIC_KEY
 */

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (!x.length || x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}

function keys(): string[] {
  return [process.env.BACKUP_KEY, process.env.DIAG_KEY, process.env.ADMIN_SECRET, process.env.PANEL_PUBLIC_KEY]
    .map((value) => String(value || "").trim())
    .filter((value) => value.length >= 6);
}

function authorized(request: NextRequest): boolean {
  const url = new URL(request.url);
  const given = url.searchParams.get("key") || request.headers.get("x-backup-key") || "";
  if (!given) return false;
  const allowed = keys();
  if (!allowed.length) return false;
  return allowed.some((key) => safeEqual(key, given));
}

const LATEST_HINT = "النسخة محفوظة فـ system:backup:latest — حمّلها بـ ?latest=1";

function modeOf(request: NextRequest): "meta" | "full" {
  const url = new URL(request.url);
  return url.searchParams.get("mode") === "meta" ? "meta" : "full";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "مفتاح غير صالح" }, { status: 401 });
  const url = new URL(request.url);
  // 💾 ?save=1 → تخزين نسخة داخل قاعدة البيانات (بدون تحميل الملف) — كتستعمل للنسخ اليدوية
  if (url.searchParams.get("save") === "1") {
    const saved = await saveSnapshot(modeOf(request));
    return NextResponse.json({ ok: true, saved, latest: LATEST_HINT });
  }
  if (url.searchParams.get("latest") === "1") {
    const snapshot = await latestSnapshot();
    if (!snapshot) return NextResponse.json({ ok: false, error: "ما كايناش نسخة محفوظة — دير POST أولاً" }, { status: 404 });
    return NextResponse.json({ ok: true, version: BACKUP_VERSION, snapshot });
  }
  const payload = await buildBackup(modeOf(request));
  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="ft-backup-${new Date(payload.at).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json"`,
      "cache-control": "no-store",
    },
  });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "مفتاح غير صالح" }, { status: 401 });
  const saved = await saveSnapshot(modeOf(request));
  return NextResponse.json({ ok: true, ...saved });
}
