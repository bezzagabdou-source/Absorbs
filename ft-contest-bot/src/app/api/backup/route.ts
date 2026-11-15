/**
 * 💾 نسخ احتياطي ودمج — محمي بـ BACKUP_KEY (24 حرفاً على الأقل؛ بدونه 404).
 *
 *   GET /api/backup?k=…&what=counts            أعداد القاعدة الحالية (بلا بيانات شخصية)
 *   GET /api/backup?k=…&what=counts&db=old     أعداد القاعدة القديمة (OLD_DATABASE_URL)
 *   GET /api/backup?k=…&what=export[&db=old]   ملف JSON كامل للتنزيل
 *   GET /api/backup?k=…&what=import            معاينة الدمج (لا يكتب شيئاً)
 *   GET /api/backup?k=…&what=import&apply=yes  تنفيذ الدمج (idempotent)
 *
 * يقرأ القاعدة مباشرة: إن كانت معطّلة يرجع 503 بالسبب، ولا يصدّر بيانات الاحتياط.
 */
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { countsOf, currentCounts, describeUrl, exportAll, importOldDatabase, oldDatabaseUrl } from "@/lib/dbBackup";
import { postgresUrl, storageInfo } from "@/lib/store";
import { journalLength } from "@/lib/storeResilience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const expected = String(process.env.BACKUP_KEY || "");
  if (expected.length < 24) return false;
  const given = request.nextUrl.searchParams.get("k") || request.headers.get("x-backup-key") || "";
  const a = crypto.createHash("sha256").update(expected).digest();
  const b = crypto.createHash("sha256").update(given).digest();
  return crypto.timingSafeEqual(a, b);
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store", ...extra } });

export async function GET(request: NextRequest) {
  if (!authorized(request)) return json({ error: "not found" }, 404);
  const params = request.nextUrl.searchParams;
  const what = params.get("what") || "counts";
  const db = params.get("db") === "old" ? "old" : "current";
  try {
    if (storageInfo().backend !== "postgres") return json({ ok: false, error: "المخزن الأساسي ليس Postgres" }, 400);
    if (what === "counts") {
      if (db === "old") {
        const url = oldDatabaseUrl();
        if (!url) return json({ ok: false, error: "OLD_DATABASE_URL غير مضبوط" }, 400);
        const { Pool } = await import("pg");
        const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 10_000, ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url) ? undefined : { rejectUnauthorized: false } });
        try {
          return json({ ok: true, db, source: describeUrl(url), counts: await countsOf(pool) });
        } finally {
          await pool.end().catch(() => undefined);
        }
      }
      return json({
        ok: true,
        db,
        source: describeUrl(postgresUrl()),
        old: describeUrl(oldDatabaseUrl()),
        journalPending: await journalLength(),
        counts: await currentCounts(),
      });
    }
    if (what === "export") {
      const dump = await exportAll(db);
      const name = `ft-bot-${db}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
      return json(dump, 200, { "content-disposition": `attachment; filename="${name}"` });
    }
    if (what === "import") {
      const report = await importOldDatabase({ dryRun: params.get("apply") !== "yes" });
      return json({ ok: true, ...report });
    }
    return json({ ok: false, error: "what غير معروف" }, 400);
  } catch (error) {
    // القاعدة معطّلة/غير متاحة: نقولها صراحة بدل تصدير بيانات مؤقتة
    return json({ ok: false, db, error: String((error as Error)?.message || error).slice(0, 300) }, 503);
  }
}
