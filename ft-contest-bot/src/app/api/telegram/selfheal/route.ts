import { NextResponse, type NextRequest } from "next/server";
import { ensureBotReady, resetAutoSetupCache } from "@/lib/botSetup";
import { channelAdminReport } from "@/lib/channels";
import { pushAdminLog } from "@/lib/rewards";
import { tgCall } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ══════════════════════════════════════════════════════════════════════════
   🩺 إصلاح ذاتي للويب هوك.

   السبب اللي خلانا نضيفوه: الويب هوك كان يشير لمشروع قديم (ft-contests-bot)
   ويرجّع 401، فالبوت ما يردّش أبداً. هذا المسار:
     1) يقرا getWebhookInfo
     2) إلا كان الرابط ماشي هو رابط ft-bot (أو allowed_updates ناقصة) → setWebhook
     3) يعاود يقرا الحالة ويرجّع pending + last_error
     4) يفحص القنوات الست: واش البوت أدمن في كل واحدة

   يشتغل تلقائياً عبر cron (vercel.json) وبالتوقيت اللي نضغطو فيه.
   ══════════════════════════════════════════════════════════════════════════ */

function authorized(request: NextRequest): boolean {
  // 1) cron ديال Vercel
  if (request.headers.get("x-vercel-cron")) return true;
  // 2) مفتاح اللوحة
  const expected = process.env.PANEL_PUBLIC_KEY || "";
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-panel-key") || "";
  if (expected && key === expected) return true;
  // 3) سر الويب هوك
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET || "";
  const given = url.searchParams.get("secret") || request.headers.get("x-telegram-bot-api-secret-token") || "";
  if (secret && given === secret) return true;
  // 4) ماكانش أي مفتاح مضبوط → نسمحو (المسار ما يرجّعش أسرار)
  return !expected && !secret;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get("force") !== "0";
  if (force) resetAutoSetupCache();

  try {
    const status = await ensureBotReady({ force });

    // نقراو الحالة النهائية من تيليغرام مباشرة
    const info = await tgCall<{
      url?: string;
      pending_update_count?: number;
      last_error_message?: string;
      allowed_updates?: string[];
    }>("getWebhookInfo", {});

    const channels = await channelAdminReport().catch(() => null);
    const missingAdmin = channels ? channels.channels.filter((c) => !c.isAdmin).map((c) => c.chat) : [];

    const report = {
      ok: status.botOk && Boolean(info.result?.url),
      bot: {
        username: status.botUsername ? `@${status.botUsername}` : null,
        connected: status.botOk,
      },
      webhook: {
        expected: status.webhookExpected,
        current: info.result?.url || status.webhookCurrent || "",
        matches: (info.result?.url || "") === status.webhookExpected,
        pending: info.result?.pending_update_count ?? -1,
        lastError: info.result?.last_error_message || null,
        allowedUpdates: info.result?.allowed_updates || [],
        fixedNow: status.fixed,
      },
      channels: channels
        ? {
            missingAdmin,
            details: channels.channels.map((c) => ({
              chat: c.chat,
              title: c.title,
              botStatus: c.botStatus,
              isAdmin: c.isAdmin,
              canVerifyMembers: c.canVerifyMembers,
              error: c.error,
            })),
          }
        : { missingAdmin: [], details: [], error: "تعذّر فحص القنوات" },
      details: status.details,
      checkedAt: new Date().toISOString(),
    };

    await pushAdminLog({
      at: Date.now(),
      op: "webhook_selfheal",
      detail: `webhook=${report.webhook.current || "فارغ"} pending=${report.webhook.pending} fixed=${
        report.webhook.fixedNow ? "1" : "0"
      } missingAdmin=${missingAdmin.join(",") || "لا شيء"}`,
      via: "panel",
    }).catch(() => undefined);

    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: String((error as Error)?.message || error) },
      { status: 500 },
    );
  }
}
