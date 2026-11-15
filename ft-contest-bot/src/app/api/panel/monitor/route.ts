import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  listReports,
  banMonitorUser,
  unbanMonitorUser,
  dismissReport,
  scanUserById,
  scanRecentUsers,
  monitorConfigured,
  monitorEnabled,
} from "@/lib/monitor";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: NextRequest) {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(req.headers.get("x-panel-key") || "");
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

const response = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * 👁️ مراقب الذكاء الاصطناعي الخفي — واجهته من لوحة التحكم.
 *   action=view        : يرجّع التقارير (الأحدث أولاً) مع عدد المعلقين والمزوّدين والإحصائيات.
 *   action=ban         : يحظر العضو (في البوت + يطيحه من المجموعة المربوطة).
 *   action=unban       : يفك حظر العضو.
 *   action=dismiss     : يخفي تقرير (يبقى محفوظاً في السجل).
 *   action=scan_user   : يفحص عضواً محدداً بمعرّفه فوراً.
 *   action=scan_recent : يفحص آخر الأعضاء المسجّلين في البوت.
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return response({ ok: false, error: "unauthorized" }, 401);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || "view");

  if (action === "view") {
    const { reports, pending, stats } = await listReports(Number(body.limit) || 100);
    const settings = await getSettings().catch(() => null);
    return response({
      ok: true,
      enabled: monitorEnabled(),
      providers: monitorConfigured(),
      group: settings?.groupChat ? { chatId: settings.groupChat, title: settings.groupTitle } : null,
      pending,
      stats,
      reports,
    });
  }

  if (action === "scan_recent") {
    return response(await scanRecentUsers(Number(body.limit) || 15));
  }

  const userId = String(body.userId || "").trim();
  if (!/^\d{1,20}$/.test(userId)) {
    return response({ ok: false, error: "معرّف المستخدم غير صالح" }, 400);
  }

  if (action === "scan_user") {
    return response(await scanUserById(userId));
  }

  const settings = await getSettings();
  if (action === "ban") return response(await banMonitorUser(userId, settings));
  if (action === "unban") return response(await unbanMonitorUser(userId, settings));
  if (action === "dismiss") return response(await dismissReport(userId));
  return response({ ok: false, error: "إجراء غير معروف" }, 400);
}
