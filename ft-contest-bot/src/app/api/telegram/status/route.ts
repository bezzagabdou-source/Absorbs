import { NextResponse, type NextRequest } from "next/server";
import { ensureBotReady } from "@/lib/botSetup";
import { listContests } from "@/lib/contests";
import { getStore, storageInfo } from "@/lib/store";
import { usersCount } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * تشخيص عام (بدون أي أسرار): حالة التوكن، الويب هوك، التخزين، والأرقام.
 * يصلح لتفتحه من المتصفح وتشوف سبب عدم عمل البوت.
 */
export async function GET(request: NextRequest) {
  const force = new URL(request.url).searchParams.get("fix") === "1";
  const status = await ensureBotReady({ force });
  const [contests, users, claims, storage] = await Promise.all([
    listContests(),
    usersCount(),
    getStore().zCount("claims:index"),
    storageInfo(),
  ]);

  return NextResponse.json({
    ok: status.botOk && status.webhookMatches,
    bot: {
      tokenConfigured: status.tokenConfigured,
      connected: status.botOk,
      username: status.botUsername ? `@${status.botUsername}` : null,
      link: status.botUsername ? `https://t.me/${status.botUsername}` : null,
      webhookExpected: status.webhookExpected,
      webhookCurrent: status.webhookCurrent || null,
      webhookMatches: status.webhookMatches,
      pendingUpdates: status.pendingUpdates,
      lastError: status.lastError || null,
      secretProtected: status.secretProtected,
      autoFixedNow: status.fixed,
    },
    storage: {
      backend: storage.backend,
      persistent: storage.configured,
      hint: storage.configured
        ? "البيانات محفوظة بشكل دائم"
        : "لا توجد قاعدة بيانات — أضف Upstash Redis من Vercel ← Storage ثم Redeploy",
    },
    data: { contests: contests.length, active: contests.filter((c) => c.status === "active").length, users, claims },
    details: status.details,
    checkedAt: new Date().toISOString(),
  });
}
