/**
 * 🔁 ترحيل بيانات اللوحة القديمة إلى قاعدة بيانات البوت.
 *
 * POST { snapshot, options?, dryRun? } مع ترويسة x-panel-key.
 * الافتراضي معاينة (dryRun=true). الكتابة تتطلب { dryRun:false, confirm:true }.
 * العملية idempotent: إعادة الإرسال لا تُضاعف النقاط ولا تُنشئ تكراراً.
 */
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { migrateLegacy, type MigrationOptions } from "@/lib/legacyImport";
import { pushAdminLog } from "@/lib/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY = 3_500_000;
const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

function authorized(request: NextRequest): boolean {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(
    request.headers.get("x-panel-key") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""),
  );
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function options(input: unknown): MigrationOptions {
  const raw = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const points = ["fill-empty", "max", "skip"].includes(String(raw.points)) ? String(raw.points) as MigrationOptions["points"] : "fill-empty";
  const requests = ["pending", "all", "skip"].includes(String(raw.requests)) ? String(raw.requests) as MigrationOptions["requests"] : "pending";
  return {
    users: raw.users !== false,
    points,
    prizes: raw.prizes !== false,
    requests,
    settings: raw.settings !== false,
    channels: raw.channels !== false,
  };
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return reply({ ok: false, error: "unauthorized" }, 401);
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > MAX_BODY) return reply({ ok: false, error: "اللقطة كبيرة جداً؛ قسّمها إلى دفعات" }, 413);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reply({ ok: false, error: "الطلب ليس JSON صالحاً" }, 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ ok: false, error: "الطلب غير صالح" }, 400);
  const dryRun = body.dryRun !== false;
  if (!dryRun && body.confirm !== true) return reply({ ok: false, error: "تأكيد الكتابة مطلوب (confirm=true)" }, 400);
  if (!body.snapshot || typeof body.snapshot !== "object") return reply({ ok: false, error: "اللقطة (snapshot) مطلوبة" }, 400);

  try {
    const report = await migrateLegacy(body.snapshot, options(body.options), { dryRun });
    if (!dryRun) {
      await pushAdminLog({
        at: Date.now(),
        op: "legacy_migrate",
        detail: `users +${report.users.created} · points ${report.users.pointsSet} · prizes +${report.prizes.created} · requests ${report.requests.imported}`,
        via: "panel",
      }).catch(() => undefined);
    }
    return reply({ ok: true, report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر الترحيل";
    return reply({ ok: false, error: message.slice(0, 300) }, 400);
  }
}
