import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureBotReady, resetAutoSetupCache } from "@/lib/botSetup";
import { runHealthRepair } from "@/lib/selfHeal";
import { degradationInfo } from "@/lib/storeResilience";
import { getSettings } from "@/lib/settings";
import { logError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * ♻️ نبضة الحياة — كتخدم كل 6 ساعات (Vercel Cron) ومن المتصفح بـ CRON_SECRET.
 *
 * الهدف الوحيد: البوت ما يوقفش أبداً. كل مرة كتأكّد:
 *   1. التوكن موجود وصالح (getMe ناجح).
 *   2. الويب هوك مسجّل على دومين الإنتاج مع كل أنواع التحديثات.
 *   3. منيو الأوامر موجود.
 *   4. الكتابات المتراكمة وقت عطل القاعدة كتتطبّق (retryPendingWrites).
 *   5. أي عطل كيتسجّل في اللوحة + كيتبعت تنبيه للمالك.
 */
function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET || "";
  if (secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const provided = Buffer.from(request.headers.get("authorization") || "");
  // كنديرو كمان دعم ?secret= باش يتفعّد من المتصفح بسهولة
  const query = request.nextUrl.searchParams.get("secret") || "";
  if (query && query.length === secret.length) {
    const a = Buffer.from(secret);
    const b = Buffer.from(query);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const before = degradationInfo();
  try {
    // 🔑 الإعدادات أولاً: إلا كانت القاعدة طايحة، دابا كنرجعو للذاكرة وما كتطيحش
    const settings = await getSettings();
    resetAutoSetupCache();
    const status = await ensureBotReady({ force: true });
    const heal = await runHealthRepair();
    const after = degradationInfo();
    const ok = status.botOk && status.webhookMatches && heal.ok;
    if (!ok) {
      await logError("cron", new Error(`self-heal: botOk=${status.botOk} webhook=${status.webhookMatches} heal=${heal.ok}`), {
        job: "self-heal",
        details: status.details.join(" | ").slice(0, 400),
      }).catch(() => undefined);
    }
    return NextResponse.json(
      {
        ok,
        bot: {
          tokenConfigured: status.tokenConfigured,
          connected: status.botOk,
          username: status.botUsername ? `@${status.botUsername}` : null,
          webhookMatches: status.webhookMatches,
          webhookCurrent: status.webhookCurrent || null,
          pendingUpdates: status.pendingUpdates,
          autoFixedNow: status.fixed,
          details: status.details,
        },
        heal,
        storage: {
          backend: before.degraded ? "memory (degraded)" : settings.botToken ? "ok" : "unknown",
          degradedBefore: before.degraded,
          degradedAfter: after.degraded,
          pendingWrites: after.pendingWrites,
          retriedWrites: heal.retriedWrites,
        },
        ms: Date.now() - started,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // حتى إلا طاح كلشي: كنرجّعو 200 وكنسجّلو — الكرون ما خاصوش يبان فاشل بلا سبب
    await logError("cron", error, { job: "self-heal" }).catch(() => undefined);
    return NextResponse.json(
      { ok: false, error: String((error as Error)?.message || error).slice(0, 300), ms: Date.now() - started },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}

/** Vercel Cron كيصيفط GET فقط، ولكن بعض الإعدادات كتصيفط POST — نعاونوه */
export const POST = GET;
