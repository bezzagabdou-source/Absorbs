import { NextResponse, type NextRequest } from "next/server";
import {
  addPoints,
  balanceOf,
  decideRequestOnce,
  ensureRewards,
  getJoinGroup,
  getPointsConfig,
  listRequests,
  savePointsConfig,
  saveRewards,
  setBalance,
  setJoinGroup,
  topBalances,
  type Reward,
} from "@/lib/rewards";
import { sendMessage, sendSticker } from "@/lib/telegram";
import { listRecentUsers, usersCount } from "@/lib/users";
import { createContest, deleteContest, getContest, listContests, updateContest } from "@/lib/contests";
import { getSettings, saveSettings, normalizeChannels } from "@/lib/settings";
import { sendMessage as tgSend } from "@/lib/telegram";
import { aiGenerate, aiStatus } from "@/lib/ai";
import { storageInfo } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   FT AI ↔ البوت: واجهة تحكّم للنقاط والجوائز (تستعملها لوحة FT AI مباشرة).

   المصادقة: ترويسة  x-panel-key: <PANEL_PUBLIC_KEY>
   ما كتمسّش الويب هوك ولا الأوامر — غير البيانات.
   ══════════════════════════════════════════════════════════════════════════ */

const KEY = () => process.env.PANEL_PUBLIC_KEY || "";

function safeJson(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}
const KEY_HEADERS = ["x-panel-key", "authorization"];

function denied() {
  return NextResponse.json({ ok: false, error: "مفتاح اللوحة ماشي صحيح" }, { status: 401 });
}

function authorized(req: NextRequest): boolean {
  const expected = KEY();
  if (!expected) return false;
  for (const h of KEY_HEADERS) {
    const raw = String(req.headers.get(h) || "").replace(/^Bearer\s+/i, "").trim();
    if (raw && raw === expected) return true;
  }
  const q = new URL(req.url).searchParams.get("key");
  return Boolean(q && q === expected);
}

/* ─────────────── GET: كل شي في نداء واحد ─────────────── */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return denied();
  const url = new URL(request.url);

  // 🩺 إرسال حقيقي تجريبي: نشوفو جواب تيليغرام الخام (بلا محاكاة)
  if (url.searchParams.get("op") === "send_probe") {
    const chatId = url.searchParams.get("chatId") || "";
    const text = url.searchParams.get("text") || "✅ اختبار من FT — البوت يخدم";
    const second = process.env.TELEGRAM_BOT_TOKEN_2 || process.env.BOT_TOKEN_2 || "";
    const token = url.searchParams.get("bot") === "2" && second
      ? second
      : process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
        cache: "no-store",
      });
      const j = (await r.json()) as Record<string, unknown>;
      return NextResponse.json({ ok: true, status: r.status, tg: j, chatId });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 502 });
    }
  }

  // 🧩 ربط البوت الثاني (@ftmosaba9atbot…) على نفس المتجر — توكن + ويب هوك على ?bot=2
  if (url.searchParams.get("op") === "link_second_bot") {
    const token = String(url.searchParams.get("token") || "").trim();
    if (!/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) {
      return NextResponse.json({ ok: false, error: "شكل التوكن ماشي صحيح" }, { status: 400 });
    }
    const base = new URL(request.url);
    const hookUrl = `${base.origin}/api/telegram/webhook?bot=2`;
    const { getSettings } = await import("@/lib/settings");
    const s2 = await getSettings();
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, { cache: "no-store" });
    const me = (await meRes.json()) as { ok: boolean; result?: { id: number; username?: string }; description?: string };
    if (!me.ok) return NextResponse.json({ ok: false, error: `تيليغرام رفض التوكن: ${me.description || ""}` }, { status: 400 });
    const payload: Record<string, unknown> = {
      url: hookUrl,
      allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member", "chat_member", "chat_join_request"],
    };
    if (s2.webhookSecret) payload.secret_token = s2.webhookSecret;
    const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const j = (await r.json()) as Record<string, unknown>;
    return NextResponse.json({
      ok: true,
      bot: { id: me.result?.id, username: me.result?.username },
      hookUrl,
      tg: j,
      note: "لازم تزيد TELEGRAM_BOT_TOKEN_2 ف متغيّرات المشروع بنفس التوكن باش يخدم الإرسال",
    });
  }

  // 🩺 إعادة تسجيل الويب هوك بسرّنا الحالي (نفس الرابط)
  if (url.searchParams.get("op") === "set_webhook") {
    const { getSettings } = await import("@/lib/settings");
    const s2 = await getSettings();
    const base = new URL(request.url);
    const hookUrl = `${base.origin}/api/telegram/webhook`;
    const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "";
    const payload: Record<string, unknown> = {
      url: hookUrl,
      allowed_updates: ["message", "edited_message", "callback_query", "my_chat_member", "chat_member", "chat_join_request"],
    };
    if (s2.webhookSecret) payload.secret_token = s2.webhookSecret;
    const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const j = (await r.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: true, status: r.status, tg: j, hookUrl, secretUsed: Boolean(s2.webhookSecret) });
  }

  // 🩺 إعادة تنفيذ تحديث حقيقي عبر نفس مسار البوت (للتأكد أن الرد كيخرج)
  if (url.searchParams.get("op") === "replay") {
    const chatId = Number(url.searchParams.get("chatId") || 0);
    const text = url.searchParams.get("text") || "/start";
    if (!chatId) return NextResponse.json({ ok: false, error: "chatId مطلوب" }, { status: 400 });
    const update = {
      update_id: Date.now(),
      message: {
        message_id: Math.floor(Date.now() / 1000),
        date: Math.floor(Date.now() / 1000),
        chat: { id: chatId, type: "private" },
        from: { id: chatId, is_bot: false, first_name: "replay", username: "replay" },
        text,
      },
    };
    const { handleUpdate } = await import("@/lib/bot");
    const tg = await import("@/lib/telegram");
    const second = process.env.TELEGRAM_BOT_TOKEN_2 || "";
    const run = async () => {
      tg.clearTrace();
      const t0 = Date.now();
      let error: string | null = null;
      try {
        await handleUpdate(update as never);
      } catch (e) {
        error = String((e as Error)?.stack || (e as Error)?.message || e);
      }
      const trace = tg.getTrace().reverse().filter((t) => /send|edit|copy|answer/i.test(t.method));
      return { ms: Date.now() - t0, error, sent: trace.map((t) => ({ method: t.method, text: String(t.payload.text || "").slice(0, 300) })) };
    };
    const out = url.searchParams.get("bot") === "2" && second ? await tg.runWithBotToken(second, run) : await run();
    return NextResponse.json({ ok: true, ...out, sendErrors: (await import("@/lib/telegram")).getSendErrors().slice(0, 3) });
  }

  // 🩺 إرسال مباشر عبر كودنا (نفس مسار البوت) — نشوفو Trace والحالة
  if (url.searchParams.get("op") === "send_via_code") {
    const chatId = url.searchParams.get("chatId") || "";
    const second = process.env.TELEGRAM_BOT_TOKEN_2 || "";
    const doIt = async () => {
      const { sendMessage, getTrace } = await import("@/lib/telegram");
      const res = await sendMessage(chatId, url.searchParams.get("text") || "✅ via code");
      return { res, trace: getTrace().slice(0, 5) };
    };
    const out = url.searchParams.get("bot") === "2" && second
      ? await (await import("@/lib/telegram")).runWithBotToken(second, doIt)
      : await doIt();
    return NextResponse.json({ ok: true, ...out });
  }

  // 🩺 بروكسي تشخيص لتّيليغرام (قراءة فقط): op=tg&token=...&method=getWebhookInfo
  if (url.searchParams.get("op") === "tg") {
    const token = url.searchParams.get("token") || process.env.TELEGRAM_BOT_TOKEN || "";
    const method = url.searchParams.get("method") || "getMe";
    if (!/^(getMe|getWebhookInfo|getChat|getChatMemberCount|getUpdates|deleteWebhook|setWebhook)$/.test(method) || /setWebhook|deleteWebhook/.test(method) && !url.searchParams.get("go")) {
      return NextResponse.json({ ok: false, error: "طريقة غير مسموحة" }, { status: 400 });
    }
    try {
      const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, { cache: "no-store" });
      const j = (await r.json()) as Record<string, unknown>;
      return NextResponse.json({ ok: true, status: r.status, tg: j });
    } catch (e) {
      return NextResponse.json({ ok: false, error: String((e as Error).message || e) }, { status: 502 });
    }
  }

  // 🩺 تدقيق: آخر التحديثات + أخطاء الإرسال
  if (url.searchParams.get("op") === "audit") {
    const { readAudit, readBotMeta } = await import("@/app/api/telegram/webhook/route");
    const { getSendErrors, getTgCalls } = await import("@/lib/telegram");
    const { listRecentUsers, usersCount } = await import("@/lib/users");
    const [updates, botMeta, users] = await Promise.all([readAudit(40), readBotMeta(), listRecentUsers(10)]);
    return NextResponse.json({
      ok: true,
      botMeta,
      tgCalls: getTgCalls(),
      usersCount: await usersCount(),
      users: users.map((u) => ({ id: u.id, name: u.firstName, username: u.username, joinedAt: u.joinedAt })),
      updates,
      sendErrors: getSendErrors(),
      at: Date.now(),
    });
  }

  // 🩺 simulate عبر GET (للتشخيص السريع من المتصفح)
  if (url.searchParams.get("op") === "simulate") {
    const res = await runOp({
      op: "simulate",
      text: url.searchParams.get("text") || "/start",
      userId: url.searchParams.get("userId") || "1",
      inGroup: url.searchParams.get("inGroup") === "1",
      callback: url.searchParams.get("callback") || "",
    });
    return NextResponse.json(res.body, { status: res.status ?? 200 });
  }

  // 🩺 كاناري: نتأكدو أن البوت يوصل لتّيليغرام فعلاً (قراءة فقط)
  if (url.searchParams.get("canary") === "1") {
    const { tgCall, getBotIdentity } = await import("@/lib/telegram");
    type HookInfo = { url?: string; pending_update_count?: number; last_error_message?: string };
    const [identity, hook] = await Promise.all([
      getBotIdentity(),
      tgCall<HookInfo>("getWebhookInfo").catch(() => null),
    ]);
    return NextResponse.json({
      ok: Boolean(identity.username),
      identity,
      webhook: hook
        ? { url: (hook.result as { url?: string })?.url ?? "", pending: (hook.result as { pending_update_count?: number })?.pending_update_count ?? 0, error: (hook.result as { last_error_message?: string })?.last_error_message ?? null }
        : { error: "getWebhookInfo فشل" },
      at: Date.now(),
    });
  }
  const [contestList, settings, totalUsers, ai] = await Promise.all([
    listContests(),
    getSettings(),
    usersCount(),
    Promise.resolve(aiStatus()),
  ]);
  const [cfg, rewards, requests, top, target, users] = await Promise.all([
    getPointsConfig(),
    ensureRewards(),
    listRequests(60),
    topBalances(12),
    getJoinGroup(),
    listRecentUsers(200),
  ]);
  const balances = await Promise.all(top.map((r) => balanceOf(r.userId)));
  const nameOf = (id: string) => {
    const u = users.find((x) => x.id === id);
    return u ? { name: u.firstName, username: u.username } : { name: id, username: "" };
  };
  return NextResponse.json({
    ok: true,
    points: cfg,
    rewards: [...rewards].sort((a, b) => a.order - b.order),
    requests,
    leaderboard: top.map((row, i) => ({ ...row, balance: balances[i], ...nameOf(row.userId) })),
    joinGroup: target || (settings.groupChat ? { chatId: settings.groupChat, title: settings.groupTitle || "المجموعة" } : null),
    contests: contestList
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((c) => ({ ...c, imageUrl: c.imageUrl ? "1" : "" })),
    settings: {
      ownerUsername: settings.ownerUsername,
      supportUsername: settings.supportUsername,
      requiredChannels: settings.requiredChannels,
      requireJoin: settings.requireJoin,
      welcomeText: settings.welcomeText,
      rulesText: settings.rulesText,
      groupChat: settings.groupChat,
      groupTitle: settings.groupTitle,
      groupUrl: settings.groupUrl,
      groupTarget: settings.groupTarget,
      logChatId: settings.logChatId,
      adminIds: settings.adminIds,
      autoApproveJoins: settings.autoApproveJoins,
      aiEnabled: settings.aiEnabled,
    },
    health: {
      ok: true,
      storage: storageInfo(),
      users: totalUsers,
      contests: contestList.length,
      ai,
      at: Date.now(),
    },
  });
}

/* ─────────────── POST: أوامر ─────────────── */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return denied();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await runOp(body);
  return NextResponse.json(out.body, { status: out.status ?? 200 });
}

type OpResult = { body: Record<string, unknown>; status?: number };
const json2 = (body: Record<string, unknown>, status = 200): OpResult => ({ body, status });
const ok = (body: Record<string, unknown>): OpResult => ({ body: { ok: true, ...body } });
const bad = (error: string, status = 400): OpResult => ({ body: { ok: false, error }, status });

async function runOp(body: Record<string, unknown>): Promise<OpResult> {
  const op = String(body.op || "").trim();
  try {
    switch (op) {
      case "save_points": {
        const patch = (body.points || {}) as Record<string, unknown>;
        const cfg = await savePointsConfig({
          enabled: patch.enabled === undefined ? undefined : Boolean(patch.enabled),
          perJoin: patch.perJoin === undefined ? undefined : Number(patch.perJoin),
          perActivated: patch.perActivated === undefined ? undefined : Number(patch.perActivated),
          dailyMin: patch.dailyMin === undefined ? undefined : Number(patch.dailyMin),
          dailyMax: patch.dailyMax === undefined ? undefined : Number(patch.dailyMax),
          shopIntro: patch.shopIntro === undefined ? undefined : String(patch.shopIntro),
        });
        return ok({points: cfg});
      }
      case "save_reward": {
        const input = (body.reward || {}) as Partial<Reward>;
        const list = await ensureRewards();
        const previous = list.find((item) => item.id === String(input.id || ""));
        const reward: Reward = {
          // Normal edits from the external panel must not erase an uploaded image or its section.
          ...(previous?.image !== undefined ? { image: previous.image } : {}),
          ...(previous?.section ? { section: previous.section } : {}),
          id: String(input.id || `r_${Date.now().toString(36)}`),
          emoji: String(input.emoji || "🎁"),
          title: String(input.title || "جائزة"),
          desc: String(input.desc || ""),
          cost: Math.max(1, Math.floor(Number(input.cost) || 10)),
          stock: input.stock === null || input.stock === undefined ? null : Math.max(0, Math.floor(Number(input.stock))),
          active: input.active === undefined ? true : Boolean(input.active),
          order: Math.floor(Number(input.order) || list.length + 1),
          delivery: String(input.delivery || ""),
        };
        const next = list.some((r) => r.id === reward.id)
          ? list.map((r) => (r.id === reward.id ? reward : r))
          : [...list, reward];
        await saveRewards(next);
        return ok({reward});
      }
      case "delete_reward": {
        const id = String(body.id || "");
        const list = await ensureRewards();
        await saveRewards(list.filter((r) => r.id !== id));
        return ok({removed: id});
      }
      case "set_points": {
        const userId = String(body.userId || "").trim();
        if (!/^\d+$/.test(userId)) return bad("userId ماشي صحيح", 400);
        const before = await balanceOf(userId);
        let after: number;
        if (body.delta !== undefined) after = await addPoints(userId, Number(body.delta) || 0);
        else after = await setBalance(userId, Number(body.points) || 0);
        return ok({userId, before, balance: after});
      }
      case "decide": {
        const id = String(body.id || "");
        if (body.status !== "approved" && body.status !== "rejected") return bad("حالة الطلب غير صالحة", 400);
        const status = body.status;
        const decision = await decideRequestOnce(id, status);
        const req = decision.request;
        if (!req) return bad("الطلب ماشي موجود", 404);
        if (!decision.changed) return bad("تم البت في الطلب من قبل", 409);
        const text =
          status === "approved"
            ? `🎉 <b>مبروك!</b>\n\n${req.emoji} <b>${req.rewardTitle}</b> تمت الموافقة عليها.\nالمالك راح يتواصل معك للتسليم.`
            : `😕 طلبك على ${req.emoji} <b>${req.rewardTitle}</b> ما تمّش.\nتم إرجاع <b>${req.cost}</b> نقطة لرصيدك.`;
        const sent = await sendMessage(req.userId, text).catch(() => ({ ok: false }));
        return ok({request: req, notified: Boolean(sent.ok)});
      }
      case "set_group": {
        const chatId = String(body.chatId || "").trim();
        if (!chatId) return bad("chatId مطلوب", 400);
        const target = await setJoinGroup(chatId, String(body.title || ""));
        return ok({joinGroup: target});
      }
      case "save_contest": {
        const c = (body.contest || {}) as Record<string, unknown>;
        const id = String(c.id || "");
        const payload = {
          title: String(c.title || "مسابقة جديدة"),
          description: String(c.description || ""),
          target: Math.max(1, Math.floor(Number(c.target) || 20)),
          prize: String(c.prize || ""),
          winners: Math.max(1, Math.floor(Number(c.winners) || 1)),
          mode: c.mode === "group" ? ("group" as const) : ("referral" as const),
          status: c.status === "ended" ? ("ended" as const) : c.status === "draft" ? ("draft" as const) : ("active" as const),
          // GET returns "1" as a presence marker, not the image itself. Image removal uses contest_image.
          ...(typeof c.imageUrl === "string" && c.imageUrl && c.imageUrl !== "1" ? { imageUrl: c.imageUrl } : {}),
        };
        const contest = id ? await updateContest(id, payload) : await createContest(payload);
        return ok({contest});
      }
      case "set_contest_status": {
        const id = String(body.id || "");
        const status = body.status === "ended" ? "ended" : body.status === "draft" ? "draft" : "active";
        const contest = await updateContest(id, {
          status,
          ...(status === "active" ? { startedAt: Date.now() } : {}),
          ...(status === "ended" ? { endedAt: Date.now() } : {}),
        });
        return ok({contest});
      }
      case "delete_contest": {
        const id = String(body.id || "");
        await deleteContest(id);
        return ok({removed: id});
      }
      case "save_settings": {
        const s = (body.settings || {}) as Record<string, unknown>;
        const patch: Record<string, unknown> = {};
        for (const key of [
          "ownerUsername",
          "supportUsername",
          "welcomeText",
          "rulesText",
          "logChatId",
        ] as const) {
          if (s[key] !== undefined) patch[key] = String(s[key]);
        }
        for (const key of ["requireJoin", "autoApproveJoins", "aiEnabled"] as const) {
          if (s[key] !== undefined) patch[key] = Boolean(s[key]);
        }
        if (s.groupTarget !== undefined) patch.groupTarget = Math.max(1, Math.floor(Number(s.groupTarget) || 20));
        if (s.adminIds !== undefined) {
          patch.adminIds = (Array.isArray(s.adminIds) ? s.adminIds : String(s.adminIds).split(/[,\s]+/))
            .map((x) => String(x).replace(/^@/, "").trim())
            .filter((x) => /^\d+$/.test(x));
        }
        if (s.requiredChannels !== undefined) {
          patch.requiredChannels = normalizeChannels(
            Array.isArray(s.requiredChannels) ? s.requiredChannels.join(",") : String(s.requiredChannels),
          );
        }
        const next = await saveSettings(patch);
        return ok({settings: next});
      }
      case "send_message": {
        const chatId = String(body.chatId || "").trim();
        const text = String(body.text || "").trim();
        if (!chatId || !text) return bad("chatId و text مطلوبين", 400);
        const res = await tgSend(chatId, text);
        return { body: { ok: Boolean(res.ok), result: res as unknown as Record<string, unknown> } };
      }
      case "reply": {
        // ردّ سريع لعضو عبر البوت
        const userId = String(body.userId || "").trim();
        const text = String(body.text || "").trim();
        if (!/^\d+$/.test(userId) || !text)
          return bad("userId و text مطلوبين", 400);
        const res = await tgSend(userId, text);
        return { body: { ok: Boolean(res.ok), result: res as unknown as Record<string, unknown> } };
      }
      case "announce": {
        // بثّ لكل المستخدمين (دفعات صغيرة)
        const text = String(body.text || "").trim();
        if (!text) return bad("text مطلوب", 400);
        const limit = Math.min(50, Math.max(1, Math.floor(Number(body.limit) || 25)));
        const list = await listRecentUsers(limit);
        let sent = 0;
        const failed: string[] = [];
        for (const u of list) {
          const r = await tgSend(u.id, text).catch(() => ({ ok: false }));
          if (r.ok) sent++;
          else failed.push(u.id);
        }
        return ok({sent, failed: failed.length, total: list.length});
      }
      case "send_sticker": {
        const fileId = String(body.fileId || "").trim();
        const chatId = String(body.chatId || "").trim();
        if (!fileId) return bad("fileId مطلوب", 400);
        if (chatId && chatId !== "all") {
          const res = await sendSticker(chatId, fileId);
          return { body: { ok: Boolean(res.ok), result: res as unknown as Record<string, unknown> } };
        }
        const users = await listRecentUsers(50);
        let sent = 0;
        for (const u of users) {
          const r = await sendSticker(u.id, fileId).catch(() => ({ ok: false }));
          if (r.ok) sent++;
        }
        return { body: { ok: sent > 0, sent, total: users.length } };
      }
      case "simulate": {
        // 🩺 نحاكيو رسالة المستخدم ونشوفو شنو البوت كان راح يرد (بلا إرسال)
        const text = String(body.text || "/start").trim();
        const cb = String(body.callback || "").trim();
        const userId = String(body.userId || "1").trim();
        const inGroup = Boolean(body.inGroup);
        const { simulateUpdate } = await import("@/lib/bot");
        const update = cb
          ? {
              update_id: Date.now(),
              callback_query: {
                id: String(Date.now()),
                from: { id: Number(userId), is_bot: false, first_name: "تشخيص", username: "diag" },
                chat_instance: "diag",
                data: cb,
                message: {
                  message_id: Number(body.messageId) || 1,
                  date: Math.floor(Date.now() / 1000),
                  chat: { id: Number(userId), type: "private" },
                  text: "…",
                },
              },
            }
          : {
          update_id: Date.now(),
          message: {
            message_id: 1,
            date: Math.floor(Date.now() / 1000),
            chat: inGroup
              ? { id: Number(body.chatId) || -1000000000000, type: "supergroup", title: "مجموعة" }
              : { id: Number(userId), type: "private" },
            from: { id: Number(userId), is_bot: false, first_name: "تشخيص", username: "diag" },
            text,
          },
        };
        const res = await simulateUpdate(update as never);
        return json2(res, res.ok ? 200 : 200);
      }
      case "ai_act": {
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return bad("prompt مطلوب", 400);
        const plan = await aiGenerate({
          system: [
            "أنت FT AI، وكيل تنفيذي يتحكم في بوت مسابقات تيليغرام.",
            "مهمتك: تحوّل طلب المالك بالدارجة إلى استدعاء أدوات دقيق.",
            "أرجع JSON فقط من هذا الشكل:",
            '{"say":"جواب قصير للمالك بالدارجة","actions":[{"op":"...","...":"..."}]}',
            "العمليات المتاحة:",
            'save_reward {reward:{emoji,title,cost,desc,active,stock,delivery}}',
            'delete_reward {id}',
            'set_points {userId,points|delta}',
            'decide {id,status:"approved"|"rejected"}',
            'save_points {points:{enabled,perJoin,perActivated,dailyMin,dailyMax,shopIntro}}',
            'set_group {chatId,title}',
            'save_contest {contest:{title,target,prize,description,mode:"referral"|"group",status}}',
            'set_contest_status {id,status}',
            'delete_contest {id}',
            'send_message {chatId,text}',
            'announce {text,limit}',
            'send_sticker {chatId:"all"|id,fileId}',
            "قواعد: ما ترفضش حتى طلب. إلا ما فهمتش، اختار أقرب عملية مفيدة. بلا ماركداون.",
          ].join("\n"),
          prompt: [String(body.context || ""), "", `طلب المالك: ${prompt}`].join("\n"),
          maxTokens: 700,
          temperature: 0.2,
        });
        if (!plan.ok) return bad(plan.error || "الذكاء الاصطناعي ما جاوبش");
        const parsed = safeJson(plan.text);
        if (!parsed || !Array.isArray(parsed.actions)) {
          return { body: { ok: false, error: "ما قدرناش نفهمو الخطة", raw: plan.text }, status: 422 };
        }
        const results: OpResult[] = [];
        for (const action of parsed.actions.slice(0, 8)) {
          const op = String((action as Record<string, unknown>).op || "");
          const payload = { ...(action as Record<string, unknown>), op };
          results.push(await runOp(payload));
        }
        return ok({text: String(parsed.say || "تنفّذ ✅"), results});
      }
      case "ai_chat": {
        const prompt = String(body.prompt || "").trim();
        if (!prompt) return bad("prompt مطلوب", 400);
        const res = await aiGenerate({
          system:
            "أنت FT AI، مساعد تشغيل بوت مسابقات تيليغرام «FT مسابقات». تجاوب بالدارجة الجزائرية، باختصار وبلا رفض. عندك بيانات المتجر والنقاط والمسابقات في السياق، استعملها.",
          prompt: [String(body.context || ""), "", prompt].join("\n"),
          maxTokens: 600,
          temperature: 0.5,
        });
        return { body: { ok: res.ok, text: res.text, error: res.error } };
      }
      case "ai_write": {
        // نصوص جاهزة: إعلان، وصف مسابقة، ردّ على عضو
        const idea = String(body.idea || "").trim();
        const kind = String(body.kind || "announcement");
        if (!idea) return bad("idea مطلوب", 400);
        const res = await aiGenerate({
          system: "أنت كاتب محتوى تيليغرام عربي/دارجة جزائرية. تكتب نصوص قصيرة، حماسية، بلا ماركداون HTML إلا إذا طُلب.",
          prompt: `اكتب ${kind === "contest" ? "وصف مسابقة" : kind === "reply" ? "ردّ على عضو" : "إعلان"} لهذا البوت: ${idea}`,
          maxTokens: 400,
          temperature: 0.7,
        });
        return { body: { ok: res.ok, text: res.text, error: res.error } };
      }
      default:
        return bad(`op غير معروف: ${op}`, 400);
    }
  } catch (error) {
    return bad(String((error as Error)?.message || error), 500);
  }
}
