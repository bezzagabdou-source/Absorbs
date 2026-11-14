import { NextResponse, type NextRequest } from "next/server";
import { aiStatus } from "@/lib/ai";
import { ensureBotReady } from "@/lib/botSetup";
import { listContests } from "@/lib/contests";
import { getStore, storageInfo } from "@/lib/store";
import { reactionStickers, stickerId, stickerStyleOn } from "@/lib/emoji";
import { getRememberedSticker } from "@/lib/telegram";
import { usersCount } from "@/lib/users";
import { referralCheck } from "@/lib/referralsDiag";

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
    ai: aiStatus(),
    storage: {
      backend: storage.backend,
      persistent: storage.configured,
      hint: storage.configured
        ? "البيانات محفوظة بشكل دائم"
        : "لا توجد قاعدة بيانات — أضف Upstash Redis من Vercel ← Storage ثم Redeploy",
    },
    data: { contests: contests.length, active: contests.filter((c) => c.status === "active").length, users, claims },
    stickers: {
      styleOn: stickerStyleOn(),
      welcome: stickerId("welcome") || null,
      more: stickerId("more") || null,
      reactions: reactionStickers().length,
      lastFileId: (await getRememberedSticker())?.fileId || null,
      hint: "صيفط الملصق للبوت → خُذ lastFileId وحدّد STICKER_WELCOME / STICKER_MORE / STICKER_REACTIONS",
    },
    referrals: await referralCheck()
      .then((r) => ({ ok: r.ok, group: r.group, botInGroup: r.botInGroup, causes: r.causes.map((c) => c.code), counts: r.totals }))
      .catch((error) => ({ error: String(error?.message || error) })),
    details: status.details,
    checkedAt: new Date().toISOString(),
  });
}
