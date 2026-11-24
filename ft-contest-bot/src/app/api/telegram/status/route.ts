import { NextResponse, type NextRequest } from "next/server";
import { aiStatus, aiGenerateWithFallback } from "@/lib/ai";
import { ensureBotReady } from "@/lib/botSetup";
import { listContests } from "@/lib/contests";
import { getStore, storageInfo } from "@/lib/store";
import { reactionStickers, stickerId, stickerStyleOn } from "@/lib/emoji";
import { getRememberedSticker } from "@/lib/telegram";
import { usersCount } from "@/lib/users";
import { getSettings } from "@/lib/settings";
import { channelUrl, requiredChannelsOf } from "@/lib/bot";
import { tgCall } from "@/lib/telegram";
import { referralCheck } from "@/lib/referralsDiag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * تشخيص عام (بدون أي أسرار): حالة التوكن، الويب هوك، التخزين، والأرقام.
 * يصلح لتفتحه من المتصفح وتشوف سبب عدم عمل البوت.
 */
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const force = params.get("fix") === "1";
  const status = await ensureBotReady({ force });
  const [contests, users, claims, storage] = await Promise.all([
    listContests(),
    usersCount(),
    getStore().zCount("claims:index"),
    storageInfo(),
  ]);

  // 🔒 فحص قنوات الاشتراك الإجباري: موجودة؟ البوت أدمن فيها؟
  const gate: { chat: string; url: string; ok: boolean; title: string | null; error: string | null; admin: boolean | null }[] = [];
  try {
    const settings = await getSettings();
    const required = requiredChannelsOf(settings);
    const meRes = await tgCall<{ id: number }>("getMe");
    const botUserId = meRes.ok ? Number(meRes.result?.id) || 0 : 0;
    const results = await Promise.all(
      required.map(async (chat) => {
        const res = await tgCall<{ title?: string; username?: string }>("getChat", { chat_id: chat });
        const me = botUserId
          ? await tgCall<{ status?: string }>("getChatMember", { chat_id: chat, user_id: botUserId }).catch(() => null)
          : null;
        return {
          chat,
          url: channelUrl(chat),
          ok: Boolean(res.ok),
          title: res.ok ? res.result?.title || null : null,
          error: res.ok ? null : res.description || "تعذّر الوصول للقناة (البوت ماشي عضو/أدمن أو القناة تحيّدت)",
          admin: me && me.ok ? ["administrator", "creator"].includes(String(me.result?.status)) : null,
        };
      }),
    );
    gate.push(...results);
  } catch {
    /* الفحص اختياري */
  }

  return NextResponse.json({
    ok: status.botOk && status.webhookMatches,
    gate: {
      count: gate.length,
      channels: gate.map((c) => c.chat),
      allReachable: gate.every((c) => c.ok),
      checks: gate,
    },
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
    ...(params.get("ai") === "1" ? { aiLive: await aiPing() } : {}),
    ...(params.get("screen") ? { screen: await screenPing(params.get("screen") || "") } : {}),
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

/** 🧪 تجربة حقيقية لمزوّد الذكاء الاصطناعي: واش المفتاح خدام ولا لا */
async function aiPing() {
  const started = Date.now();
  try {
    const res = await aiGenerateWithFallback({ prompt: "رد بكلمة واحدة فقط: ok", maxTokens: 12 });
    return {
      ok: res.ok,
      provider: res.provider || null,
      model: res.model || null,
      ms: Date.now() - started,
      reply: String(res.text || "").slice(0, 60) || null,
      error: res.error ? String(res.error).slice(0, 200) : null,
    };
  } catch (error) {
    return { ok: false, provider: null, model: null, ms: Date.now() - started, reply: null, error: String(error).slice(0, 200) };
  }
}

/** 🧪 تجربة فحص حساب معيّن (كشف «بنات») — ?screen=<userId> */
async function screenPing(userId: string) {
  if (!/^\d{1,20}$/.test(userId)) return { ok: false, error: "حط ?screen=<userId> (أرقام فقط)" };
  try {
    const { screenReferralJoiner } = await import("@/lib/referralScreen");
    const started = Date.now();
    const verdict = await screenReferralJoiner(userId);
    return { ok: true, userId, ms: Date.now() - started, ...verdict };
  } catch (error) {
    return { ok: false, userId, error: String(error).slice(0, 200) };
  }
}
