import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  balanceOf,
  bannedIds,
  ensureRewards,
  ensureSections,
  getPointsConfig,
  listRequests,
  pushAdminLog,
  readAdminLog,
  saveRewards,
  saveSections,
  topBalances,
  type Reward,
  type Section,
} from "@/lib/rewards";
import { getSettings } from "@/lib/settings";
import { listRecentUsers, usersCount, getUser, allUserIds } from "@/lib/users";
import { listContests, updateContest, getContest } from "@/lib/contests";
import { storageInfo } from "@/lib/store";
import { aiStatus } from "@/lib/ai";
import { ALLOWED_OPS, executeAction, planActions, panelStats, planOnly } from "@/lib/agent";
import { getBotIdentity, tgCall } from "@/lib/telegram";
import { backfillReferrals, referralCheck, recentJoinAttempts, recountReferralPoints } from "@/lib/referralsDiag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ══════════════════════════════════════════════════════════════════════════
   لوحة التحكم الجديدة /admin2 — API
   • تسجيل دخول بكلمة السر (ADMIN_PASSWORD من البيئة، أو المخزّن المشفّر)
   • جلسة موقّعة HMAC في كوكي
   • كل عمليات التحكم من مكان واحد + وكيل FT AI ينفّذ الأوامر
   ══════════════════════════════════════════════════════════════════════════ */

const COOKIE = "ft_a2";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret(): string {
  return process.env.ADMIN_SECRET || process.env.SESSION_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET || "ft-a2-fallback";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

function makeToken(): string {
  const exp = Date.now() + MAX_AGE * 1000;
  return `${exp}.${sign(String(exp))}`;
}

function tokenValid(token: string | undefined): boolean {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!exp || !sig || Date.now() > exp) return false;
  const expected = sign(expRaw);
  if (sig.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function envPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

async function checkPassword(input: string): Promise<boolean> {
  const { verifyPassword } = await import("@/lib/auth");
  // 1) كلمة السر من البيئة (المطلوبة)
  const fromEnv = envPassword();
  if (fromEnv && input.length === fromEnv.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(input), Buffer.from(fromEnv))) return true;
    } catch {
      /* كمل */
    }
  }
  // 2) الكلمة المشفّرة المخزّنة (تغيير كلمة السر)
  try {
    return await verifyPassword(input);
  } catch {
    return false;
  }
}

async function authed(req: NextRequest): Promise<boolean> {
  const jar = await cookies();
  if (tokenValid(jar.get(COOKIE)?.value)) return true;
  const header = req.headers.get("authorization") || "";
  const key = req.headers.get("x-panel-key") || new URL(req.url).searchParams.get("key") || "";
  const expected = process.env.PANEL_PUBLIC_KEY || "";
  if (expected && (key === expected || header === `Bearer ${expected}`)) return true;
  return false;
}

const ok = (b: Record<string, unknown>) => NextResponse.json({ ok: true, ...b });
const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function GET(req: NextRequest) {
  const url0 = new URL(req.url);
  // 🔎 فحص جاهزية اللوحة (بلا أي سرّ): غير هل المتغيّرات موجودة
  if ((url0.searchParams.get("what") || "") === "ready") {
    const aiKeys = Object.keys(process.env)
      .filter((k) => /_API_KEY$|GOOGLE_API_KEY$|AI_MODEL$/.test(k))
      .map((k) => `${k}:${(process.env[k] || "").length}`);
    return ok({
      panel: true,
      aiKeys,
      passwordSet: Boolean(process.env.ADMIN_PASSWORD),
      secretSet: Boolean(process.env.ADMIN_SECRET),
      ai: aiStatus(),
      storage: storageInfo().backend,
    });
  }
  if (!(await authed(req))) return bad("ماشي مسجّل", 401);
  const url = new URL(req.url);
  if ((url.searchParams.get("what") || "") === "ai_probe") {
    const { aiProviderList, aiGenerate } = await import("@/lib/ai");
    const out: { provider: string; model: string; ok: boolean; error: string; sample: string }[] = [];
    for (const prov of aiProviderList()) {
      const saved: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(process.env)) if (typeof v === "string" && /_API_KEY$|GOOGLE_API_KEY$/.test(k)) saved[k] = v;
      for (const k of Object.keys(saved)) delete process.env[k];
      if (prov.id === "gemini") process.env.GEMINI_API_KEY = prov.key;
      else if (prov.id === "github") process.env.GITHUB_MODELS_TOKEN = prov.key;
      else if (prov.id === "xai") process.env.XAI_API_KEY = prov.key;
      else if (prov.id === "anthropic") process.env.ANTHROPIC_API_KEY = prov.key;
      else process.env[`${prov.id.toUpperCase()}_API_KEY`] = prov.key;
      const res = await aiGenerate({ prompt: "قول كلمة: test", maxTokens: 40, temperature: 0 });
      for (const k of Object.keys(process.env)) if (/_API_KEY$|GOOGLE_API_KEY$/.test(k) && !(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
      out.push({ provider: prov.label, model: prov.model, ok: res.ok, error: res.error, sample: res.text.slice(0, 60) });
    }
    return ok({ probe: out });
  }

  // 🔑 فحص مفاتيح مرشّحة: ?what=keytest&keys=k1,k2,k3
  if ((url.searchParams.get("what") || "") === "keytest") {
    const raw = url.searchParams.get("keys") || "";
    const keys = raw.split(/[,\s]+/).map((k) => k.trim()).filter((k) => k.length > 12);
    const out: { key: string; provider: string; ok: boolean; error: string; sample: string }[] = [];
    for (const key of keys.slice(0, 8)) {
      const masked = `${key.slice(0, 6)}…${key.slice(-4)}`;
      let provider = "openai-compatible";
      let baseUrl = "https://api.openai.com/v1";
      let model = "gpt-4o-mini";
      if (key.startsWith("gsk_")) { provider = "groq"; baseUrl = "https://api.groq.com/openai/v1"; model = "openai/gpt-oss-20b"; }
      else if (key.startsWith("sk-or-")) { provider = "openrouter"; model = "nvidia/nemotron-nano-9b-v2:free"; }
      else if (key.startsWith("csk-")) { provider = "cerebras"; baseUrl = "https://api.cerebras.ai/v1"; model = "gpt-oss-120b"; }
      else if (key.startsWith("xai-")) { provider = "xai"; baseUrl = "https://api.x.ai/v1"; model = "grok-4-fast"; }
      else if (key.startsWith("AIza")) { provider = "gemini"; model = "gemini-3.8-flash"; }
      try {
        if (provider === "gemini") {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "قول: ok" }] }], generationConfig: { maxOutputTokens: 10 } }),
            signal: AbortSignal.timeout(12_000),
          });
          const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string } };
          const text = (j.candidates?.[0]?.content?.parts || []).map((x) => x.text || "").join("").trim();
          out.push({ key: masked, provider, ok: r.ok && Boolean(text), error: j.error?.message || (r.ok ? "" : `HTTP ${r.status}`), sample: text.slice(0, 40) });
        } else if (provider === "openrouter") {
          const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, max_tokens: 20, messages: [{ role: "user", content: "قول: ok" }] }),
            signal: AbortSignal.timeout(12_000),
          });
          const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
          out.push({ key: masked, provider, ok: r.ok && Boolean((j.choices?.[0]?.message?.content || "").trim()), error: j.error?.message || (r.ok ? "" : `HTTP ${r.status}`), sample: (j.choices?.[0]?.message?.content || "").slice(0, 40) });
        } else {
          const r = await fetch(`${baseUrl}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, max_tokens: 20, messages: [{ role: "user", content: "قول: ok" }] }),
            signal: AbortSignal.timeout(12_000),
          });
          const j = (await r.json()) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
          out.push({ key: masked, provider, ok: r.ok && Boolean((j.choices?.[0]?.message?.content || "").trim()), error: j.error?.message || (r.ok ? "" : `HTTP ${r.status}`), sample: (j.choices?.[0]?.message?.content || "").slice(0, 40) });
        }
      } catch (e) {
        out.push({ key: masked, provider, ok: false, error: e instanceof Error ? e.message : "خطأ", sample: "" });
      }
    }
    return ok({ probe: out });
  }

  if ((url.searchParams.get("what") || "") === "dry") {
    const prompt = (url.searchParams.get("prompt") || "").trim();
    if (!prompt) return bad("prompt مطلوب", 400);
    return NextResponse.json({ ok: true, ...(await planOnly(prompt)) });
  }
  const what = url.searchParams.get("what") || "all";

  try {
    if (what === "stats") return ok({ stats: await panelStats(), storage: storageInfo() });

    if (what === "users") {
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      const wantAll = ["1", "all", "true"].includes((url.searchParams.get("all") || "").toLowerCase());
      const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get("limit")) || (wantAll ? 5000 : 300)));
      const pool = await (wantAll || q ? (await import("@/lib/users")).listAllUsers(limit) : listRecentUsers(limit));
      const banned = new Set(await bannedIds());
      const picked = q ? pool.filter((u) => `${u.id} ${u.firstName || ""} ${u.username || ""}`.toLowerCase().includes(q)) : pool;
      const slice = picked.slice(0, limit);
      // 💰 الأرصدة من zset واحد (سؤال واحد) حتى مع آلاف المستخدمين — بلا timeout
      const scores =
        slice.length > 120
          ? new Map((await topBalances(Math.max(200, slice.length))).map((r) => [String(r.userId), Number(r.points) || 0]))
          : null;
      const withBalances = await Promise.all(
        slice.map(async (u) => {
          const fromMap = scores ? scores.get(u.id) : undefined;
          // 🎯 القوائم الصغيرة (بحث/300) كنقراو فيهم الرصيد الحقيقي بالضبط،
          //    والقوائم الكبيرة كنديرو خريطة النقاط بس (سؤال واحد) بلا ما نطيحو في timeout
          const points =
            scores === null
              ? await balanceOf(u.id)
              : typeof fromMap === "number" && fromMap > 0
                ? fromMap
                : slice.length <= 400
                  ? await balanceOf(u.id)
                  : fromMap || 0;
          return { ...u, points: Math.max(0, points), banned: banned.has(u.id) };
        }),
      );
      return ok({ users: withBalances, total: await usersCount() });
    }

    // 📢 حالة البثّ الجماعي (جميع المستخدمين)
    if (what === "broadcast") {
      const { loadJob, view, broadcastHistory } = await import("@/lib/broadcast");
      const [job, history, banned] = await Promise.all([loadJob(), broadcastHistory(), bannedIds()]);
      const audience = (await allUserIds()).length;
      return ok({
        broadcast: view(job),
        history,
        audience,
        reachable: Math.max(0, audience - banned.length),
        bannedCount: banned.length,
      });
    }

    if (what === "ai_status") return ok({ ai: aiStatus(), ops: ALLOWED_OPS });

    /* 🩺 تشخيص الإحالات: علاش ما كيبانوش + إصلاح تلقائي */
    if (what === "referrals") {
      const chat = url.searchParams.get("chat") || "";
      return ok({
        check: await referralCheck(chat || undefined),
        recent: await recentJoinAttempts(chat || (await getSettings()).groupChat || "", 20),
      });
    }
    // ♻️ إعادة حساب نقاط الإحالات القديمة (preview ثم apply)
    if (what === "referrals_recount") {
      const apply = ["1", "yes", "true"].includes((url.searchParams.get("apply") || "").toLowerCase());
      const result = await recountReferralPoints(apply);
      await pushAdminLog({
        at: Date.now(),
        op: apply ? "referrals_recount_apply" : "referrals_recount",
        detail: `مسح ${result.scanned} · مستحق ${result.wouldCredit} · ممنوح ${result.credited} · perJoin ${result.perJoin}`,
        via: "panel",
      });
      return ok({ recount: result });
    }
    if (what === "referrals_fix") {
      const chat = url.searchParams.get("chat") || "";
      const result = await backfillReferrals(chat || undefined);
      return ok({ fixed: result, check: await referralCheck(chat || undefined) });
    }

    // 🎭 حالة الملصقات الحيّة (النشرات، أي وحدة جاهزة تبان فالبوت) + معرض HTML
    if (what === "stickers") {
      const { describeStickers, EMOJI_SETS, stickerFor } = await import("@/lib/stickers");
      const [sets, preview] = await Promise.all([
        describeStickers(),
        Promise.all(
          (["welcome", "react", "more", "win", "shop"] as const).map(async (kind) => {
            const one = await stickerFor(kind);
            return { kind, ready: Boolean(one), setName: one?.setName || "", emoji: one?.emoji || "" };
          }),
        ),
      ]);
      return ok({
        sets,
        publishHint: "what=stickers_publish&apply=1",
        preview,
        emojiPacks: EMOJI_SETS,
        gallery: "/api/panel/stickers",
        style: String(process.env.STICKER_STYLE ?? "1") !== "0" ? "on" : "off",
        note: 'الملصقات الأساسية ديالنا (قلوب/نجوم/طاقة/احتفال/كؤوس) مضمّنة وكاتترفع أوتوماتيكيا —زيد نشرة علنية اختيارية بـ {"welcome":["AppleStickers"]} فـ action=stickers_save.',
      });
    }
    // 🔍 تحقّق بلا ما نزعجو حتى واحد: getFile على كل file_id ديالنا — إلا رجع file_path
    // ملّي البوت يقدر يبعث الملصق (نفس الملف، نفس الصلاحية).
    // 🔧 رمّم الربط من تيليجرام بلا رفع (كيستعمل النشرات اللي كاينين بأسمائهم)
    if (what === "stickers_repair") {
      const st = await import("@/lib/stickers");
      const rep = await st.repairOwn();
      await pushAdminLog({ at: Date.now(), op: "stickers_repair", detail: rep.note, via: "panel" });
      return ok({ repair: rep, own: await st.ownStickers(true) });
    }
    if (what === "stickers_verify") {
      const st = await import("@/lib/stickers");
      const own = await st.ownStickers(true);
      const rows = await Promise.all(
        ([("welcome" as const), "react", "more", "win", "shop"] as const).map(async (kind) => {
          const one = await st.stickerFor(kind, 0, req.nextUrl.origin);
          if (!one) return { kind, ok: false, error: "ما كاينش ملصق" };
          const r = await tgCall<{ file_path?: string }>("getFile", { file_id: one.fileId });
          return {
            kind,
            emoji: one.emoji,
            setName: one.setName,
            ok: Boolean(r.ok && r.result?.file_path),
            path: String(r.result?.file_path || "").split("/").pop() || "",
            error: r.ok ? "" : String(r.description || "getFile فشل").slice(0, 120),
          };
        }),
      );
      const raw = await st.rawStickerSet(String(own?.sets?.[0]?.name || ""));
      const good = rows.filter((x) => x.ok).length;
      return ok({
        verify: rows,
        total: own?.sets?.reduce((n, x) => n + (x.created ? 1 : 0), 0) || 0,
        packs: (own?.sets || []).map((x) => ({ kind: x.kind, name: x.name, link: x.link, created: x.created })),
        raw,
        ok: good === 5,
        message: good === 5 ? "✅ كل صنف فيه ملصق حيّ عند تيليجرام" : `⚠️ ${good}/5 كيدعو — شوف error`,
      });
    }
    if (what === "stickers_gallery") {
      const { stickerGalleryHtml } = await import("@/lib/stickers");
      return new NextResponse(await stickerGalleryHtml([], req.nextUrl.origin), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
      });
    }
    if (what === "stickers_refresh") {
      const { refreshStickers } = await import("@/lib/stickers");
      return ok({ refresh: await refreshStickers() });
    }
    // 🚀 رفع ملصقاتنا (TGS مضمّن فالكود) لـ تيليجرام + تخزين file_ids
    if (what === "stickers_publish") {
      const st = await import("@/lib/stickers");
      const apply = ["1", "yes", "true"].includes((url.searchParams.get("apply") || "").toLowerCase());
      const force = ["1", "yes", "true"].includes((url.searchParams.get("force") || "").toLowerCase());
      const only = (url.searchParams.get("only") || "").split(",").map((x) => x.trim()).filter(Boolean);
      const prefer = url.searchParams.get("prefer") || "";
      const result = await st.publishOwn({ apply, origin: req.nextUrl.origin, force, only, prefer });
      if (apply) await pushAdminLog({ at: Date.now(), op: "stickers_publish", detail: `uploaded ${result.uploaded ?? 0} · ${result.ok ? "ok" : String((result as { message?: string }).message || "")}`, via: "panel" });
      return ok({ publish: result, own: await st.ownStickers(true) });
    }

    // 🧹 محا كل نشرة ملصقات من تيليجرام + صفّر الحالة (طلب المالك: الملصقات مطفية)
    if (what === "stickers_purge") {
      const st = await import("@/lib/stickers");
      const apply = ["1", "yes", "true"].includes((url.searchParams.get("apply") || "").toLowerCase());
      if (!apply)
        return ok({ purge: { dry: true, note: "دوس apply=1 باش تمحا النشرات قاع من تيليجرام وتتصفّر الحالة" }, own: await st.ownStickers(true) });
      const result = await st.purgeOwn();
      await pushAdminLog({ at: Date.now(), op: "stickers_purge", detail: `محيت ${result.deleted.length} نشرة · فاشل ${result.failed.length}`, via: "panel" });
      return ok({ purge: result, own: await st.ownStickers(true) });
    }

    // 🔎 كشف نشرة معينة عند تيليجرام (نفس الاسم، الخطأ الحقيقي)
    if (what === "stickers_probe") {
      const st = await import("@/lib/stickers");
      const names = (url.searchParams.get("name") || "ftfire_by_ftmosaba9atbot,ftfire_webm_by_ftmosaba9atbot")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const raw = await Promise.all(names.map(async (n) => ({ name: n, raw: await st.rawStickerSet(n) })));
      return ok({ probe: raw });
    }

    // 🪓 فضّى النشرات القديمة (تيليجرام ما كيسمحش بمحو النشرة العادية كاملا)
    if (what === "stickers_gut") {
      const st = await import("@/lib/stickers");
      const gut = await st.gutOwn();
      await pushAdminLog({ at: Date.now(), op: "stickers_gut", detail: gut.note, via: "panel" });
      return ok({ gut });
    }

    // 🎬 اختبار حيّ: صيفط ملصق حقيقي لشات (المالك بالأساس) وقول آش تصيفط فعلاً
    if (what === "stickers_test") {
      const st = await import("@/lib/stickers");
      const settings0 = await getSettings();
      const chat =
        url.searchParams.get("chat") ||
        String(settings0.adminIds?.[0] || (/^\d+$/.test(String(settings0.ownerUsername || "")) ? settings0.ownerUsername : "")) ||
        "";
      if (!chat) return bad("زيد chat=<id ولا @username> ديالك — باش نبعثو اختبار حقيقي", 400);
      const kind = (url.searchParams.get("kind") || "welcome") as "welcome" | "react" | "more" | "win" | "shop";
      const count = Math.max(1, Math.min(3, Number(url.searchParams.get("count")) || 2));
      // 🧪 بلا ابتلاع للأخطاء: كل sendSticker كيرجع السبب الحقيقي إلا فشل
      const tries: { emoji: string; fileId: string; ok: boolean; error: string }[] = [];
      let sent = 0;
      const seen = new Set<string>();
      for (let i = 0; i < count; i++) {
        const one = await st.stickerFor(kind, i * 3, req.nextUrl.origin);
        if (!one) {
          tries.push({ emoji: "", fileId: "", ok: false, error: "ما كاينش ملصق جاهز (source: none)" });
          continue;
        }
        if (seen.has(one.fileId)) continue;
        seen.add(one.fileId);
        const r = await tgCall("sendSticker", { chat_id: chat, sticker: one.fileId });
        if (r?.ok) sent += 1;
        tries.push({ emoji: one.emoji, fileId: `${one.fileId.slice(0, 18)}…`, ok: Boolean(r?.ok), error: r?.ok ? "" : String(r?.description || "فشل").slice(0, 160) });
      }
      await pushAdminLog({ at: Date.now(), op: "stickers_test", detail: `chat ${chat} · ${kind} · ${sent}/${count}`, via: "panel" });
      return ok({
        test: { chat, kind, requested: count, sent, ok: sent > 0, tries },
        hint: sent > 0 ? "✅ الملصقات كتوصل — شوف شاتك فـ تيليجرام" : "⚠️ ما وصل والو: شوف tries[0].error للسبب الحقيقي ديال تيليجرام",
      });
    }

    // 🎭 حالة الإيموجيات/الملصقات (المينيوم ديال /emojistrans → دابا في اللوحة)
    if (what === "emojis") {
      const { extraMap } = await import("@/lib/emojiAdmin");
      const map = await extraMap();
      const packs = Object.keys(map);
      return ok({ map, packs, count: packs.reduce((n, k) => n + (map[k] || []).length, 0) });
    }

    if (what === "log") return ok({ log: await readAdminLog(150) });

    if (what === "health") {
      const [info, identity] = await Promise.all([
        tgCall<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo"),
        getBotIdentity(),
      ]);
      return ok({
        identity,
        webhook: {
          url: info.result?.url || "",
          pending: info.result?.pending_update_count ?? -1,
          error: info.result?.last_error_message || null,
        },
      });
    }

    // all
    const [rewards, sections, cfg, settings, requests, contests, top] = await Promise.all([
      ensureRewards(),
      ensureSections(),
      getPointsConfig(),
      getSettings(),
      listRequests(50),
      listContests(),
      topBalances(20),
    ]);
    return ok({
      rewards,
      sections,
      points: cfg,
      settings: {
        ownerUsername: settings.ownerUsername,
        supportUsername: settings.supportUsername,
        welcomeText: settings.welcomeText,
        rulesText: settings.rulesText,
        requiredChannels: settings.requiredChannels,
        requireJoin: settings.requireJoin,
        aiEnabled: settings.aiEnabled,
        maintenanceMode: Boolean(settings.maintenanceMode),
      },
      requests,
      contests: contests.map((c) => ({ id: c.id, title: c.title, status: c.status, target: c.target })),
      top,
      stats: await panelStats(),
      ai: aiStatus(),
      ops: ALLOWED_OPS,
      storage: storageInfo(),
    });
  } catch (error) {
    return bad(String((error as Error)?.message || error), 500);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return bad("JSON ماشي صحيح", 400);
  }
  const action = String(body.action || body.op || "");

  // 🔑 تسجيل الدخول
  if (action === "login") {
    const password = String(body.password || "");
    if (!password) return bad("كلمة السر مطلوبة", 400);
    const good = await checkPassword(password);
    if (!good) return bad("كلمة السر غالطة", 401);
    const jar = await cookies();
    jar.set(COOKIE, makeToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
    return ok({ loggedIn: true });
  }

  // 🔑 تغيير كلمة السر (تتخزّن مشفّرة scrypt)
  if (action === "change_password") {
    const jar0 = await cookies();
    if (!tokenValid(jar0.get(COOKIE)?.value)) return bad("ماشي مسجّل", 401);
    const next = String(body.newPassword || "").trim();
    if (next.length < 6) return bad("كلمة السر لازم 6 حروف على الأقل", 400);
    const { setAdminPassword } = await import("@/lib/auth");
    await setAdminPassword(next);
    jar0.set(COOKIE, makeToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
    await pushAdminLog({ at: Date.now(), op: "change_password", detail: "تبديل كلمة سر اللوحة", via: "panel" });
    return ok({ changed: true });
  }

  if (action === "logout") {
    const jar = await cookies();
    jar.delete(COOKIE);
    return ok({ loggedOut: true });
  }

  if (!(await authed(req))) return bad("ماشي مسجّل", 401);

  try {
    // 🎭 نشر الملصقات: تحديد النشرات + إنعاش + استيراد إيموجي
    if (action === "stickers_publish" || action === "stickers_save" || action === "stickers_refresh" || action === "stickers_import") {
      const st = await import("@/lib/stickers");
      if (action === "stickers_publish") {
        const origin = String(body.origin || req.nextUrl.origin);
        const result = await st.publishOwn({ apply: body.apply !== false, origin, userId: String(body.userId || ""), force: Boolean(body.force) });
        await pushAdminLog({ at: Date.now(), op: "stickers_publish", detail: `uploaded ${result.uploaded ?? 0} · ${result.ok ? "ok" : String((result as { message?: string }).message || "")}`, via: "panel" });
        if (!result.ok) return bad(String((result as { message?: string }).message || "الرفع ما تمشاش"), 400);
        return ok({ publish: result, own: await st.ownStickers(true) });
      }
      if (action === "stickers_save") {
        const sets = (body.sets || {}) as Record<string, string[]>;
        const saved = await st.saveStickerSets(sets);
        const refresh = await st.refreshStickers();
        await pushAdminLog({ at: Date.now(), op: "stickers_save", detail: `${saved.kinds} صنف · ${JSON.stringify(saved.sets)}`, via: "panel" });
        return ok({ saved, refresh });
      }
      if (action === "stickers_refresh") return ok({ refresh: await st.refreshStickers() });
      const pack = String(body.pack || "").trim().replace(/^@/, "");
      if (!pack) return bad("جيب اسم النشر: t.me/addemoji/Premium_Icon", 400);
      const r = await st.importEmojiPack(pack);
      await pushAdminLog({ at: Date.now(), op: "stickers_import", detail: `${pack}: ${r.message}`, via: "panel" });
      return r.ok ? ok(r) : bad(r.message, 400);
    }

    // 🎭 إضافة حزمة إيموجي متحرك من اللوحة (بدل /addemoji في المينيوم)
    if (action === "emoji_add") {
      const pack = String(body.pack || "").trim().replace(/^@/, "");
      if (!pack) return bad("سمّي الحزمة: مثال EmojiAnimPack", 400);
      const { addPack } = await import("@/lib/emojiAdmin");
      const r = await addPack(pack);
      await pushAdminLog({ at: Date.now(), op: "emoji_add", detail: `${pack}: ${r.message}`, via: "panel" });
      return r.ok ? ok(r) : bad(r.message, 400);
    }

    // 📢 بثّ لجميع المستخدمين (منذ إنشاء البوت) — على دفعات، بشريط تقدّم
    if (action === "broadcast_start" || action === "broadcast_tick" || action === "broadcast_stop") {
      const { startBroadcast, tickBroadcast, stopBroadcast, view, summary } = await import("@/lib/broadcast");
      if (action === "broadcast_stop") {
        const job = await stopBroadcast();
        await pushAdminLog({ at: Date.now(), op: "broadcast_stop", detail: job ? summary(job) : "ماكا بثّ شغّال", via: "panel" });
        return ok({ broadcast: view(job), note: job ? "وقّفنا البثّ" : "ماكا حتى بثّ باش يوقّف" });
      }
      if (action === "broadcast_tick") {
        const job = await tickBroadcast();
        return ok({ broadcast: view(job) });
      }
      const text = String(body.text || "").trim();
      if (!text) return bad("كتب نص الرسالة", 400);
      if (text.length > 4000) return bad("الرسالة طويلة بزاف (الحد 4000 حرف)", 400);
      const job = await startBroadcast(text);
      await pushAdminLog({ at: Date.now(), op: "broadcast", detail: summary(job), via: "panel" });
      return ok({ broadcast: view(job) });
    }

    // 🤖 وكيل الذكاء الاصطناعي
    if (action === "ai") {
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return bad("اكتب طلبك", 400);
      // ⏱️ سقف زمني: إذا النموذج تبطّل نرجعو للخطة المحلية باش الواجهة ما تفشلش
      try {
        const out = await Promise.race([
          planActions(prompt),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 12_000)),
        ]);
        if (out) {
          const actions = out.actions || [];
          const results = out.results || [];
          const noResult = !actions.length && !results.length;
          return NextResponse.json({
            ok: true,
            say: out.say || out.error || "ما فهمتش الطلب — عاود صيغتو.",
            actions,
            results,
            refused: out.refused || [],
            error: noResult ? "" : undefined,
          });
        }
      } catch {
        /* نكملو للخطة المحلية */
      }
      const { localPlan } = await import("@/lib/agent");
      const local = await localPlan(prompt).catch(() => null);
      return NextResponse.json({
        ok: true,
        say: local?.say || "ما فهمتش الطلب — عاود صيغتو بالدارجة.",
        actions: local?.actions || [],
        results: local?.results || [],
        refused: [],
      });
    }

    // 🖼️ رفع صورة جائزة (base64 من الواجهة)
    if (action === "reward_image") {
      const id = String(body.id || "").trim();
      const dataUrl = String(body.dataUrl || "").trim();
      if (!id) return bad("id مطلوب", 400);
      if (dataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl)) return bad("صيغة الصورة ماشي مدعومة", 400);
      if (dataUrl.length > 2_000_000) return bad("الصورة كبيرة — الحد ~1.4 ميغا", 400);
      const list = await ensureRewards();
      const target = list.find((r) => r.id === id);
      if (!target) return bad("الجائزة ماشي موجودة", 404);
      await saveRewards(list.map((r) => (r.id === id ? { ...r, image: dataUrl } : r)));
      await pushAdminLog({ at: Date.now(), op: "reward_image", detail: `صورة الجائزة ${target.title}${dataUrl ? "" : " (تحيّدت)"}`, via: "panel" });
      return ok({ id, size: dataUrl.length });
    }

    // 🖼️ رفع صورة مسابقة
    if (action === "contest_image") {
      const id = String(body.id || "").trim();
      const dataUrl = String(body.dataUrl || "").trim();
      if (!id) return bad("id مطلوب", 400);
      if (dataUrl && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl)) return bad("صيغة الصورة ماشي مدعومة", 400);
      if (dataUrl.length > 2_000_000) return bad("الصورة كبيرة — الحد ~1.4 ميغا", 400);
      const contest = await getContest(id);
      if (!contest) return bad("المسابقة ماشي موجودة", 404);
      const updated = await updateContest(id, { imageUrl: dataUrl || undefined });
      await pushAdminLog({ at: Date.now(), op: "contest_image", detail: `صورة المسابقة ${contest.title}${dataUrl ? "" : " (تحيّدت)"}`, via: "panel" });
      return ok({ contest: { id, image: Boolean(updated?.imageUrl) } });
    }

    // 🔍 تجربة جافة للـAI (بلا تنفيذ)
    if (action === "dry") {
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return bad("اكتب طلبك", 400);
      return NextResponse.json({ ok: true, ...(await planOnly(prompt)) });
    }

    // ⚙️ تنفيذ عملية مباشرة (من الواجهة)
    if (action === "run") {
      const op = String(body.op || "");
      const outcome = await executeAction({ ...(body as Record<string, unknown>), op }, "panel");
      return NextResponse.json({ ok: outcome.ok, result: outcome });
    }

    // 🗂️ حفظ قائمة كاملة (ترتيب الأقسام/الجوائز)
    if (action === "save_sections") {
      const list = (body.sections || []) as Section[];
      const saved = await saveSections(list);
      await pushAdminLog({ at: Date.now(), op: "save_sections", detail: `أقسام: ${saved.map((s) => s.title).join("، ")}`, via: "panel" });
      return ok({ sections: saved });
    }

    if (action === "reorder_rewards") {
      const order = (body.order || []) as string[];
      const list = await ensureRewards();
      const next: Reward[] = list.map((r) => {
        const i = order.indexOf(r.id);
        return i >= 0 ? { ...r, order: i + 1 } : r;
      });
      await saveRewards(next);
      return ok({ rewards: next });
    }

    // 📢 رسالة لمستخدم أو بثّ
    if (action === "message") {
      const text = String(body.text || "").trim();
      const userId = String(body.userId || "").trim();
      if (!text) return bad("النص مطلوب", 400);
      if (userId && userId !== "all") {
        const res = await executeAction({ op: "send_message", chatId: userId, text }, "panel");
        return NextResponse.json({ ok: res.ok, result: res });
      }
      const res = await executeAction({ op: "broadcast", text }, "panel");
      return NextResponse.json({ ok: res.ok, result: res });
    }

    // 🔎 تفاصيل مستخدم
    if (action === "user_detail") {
      const id = String(body.userId || "").trim();
      const [user, points, banned] = await Promise.all([getUser(id), balanceOf(id), bannedIds()]);
      return ok({ user, points, banned: banned.includes(id) });
    }

    if (action === "save_settings" || action === "save_gate" || action === "save_reward" || action === "delete_reward") {
      const op = action === "save_gate" ? "set_gate" : action;
      const payload =
        action === "save_gate"
          ? { op: "set_gate", enabled: Boolean(body.enabled) }
          : action === "save_settings"
            ? { op: "save_settings", settings: body.settings || {} }
            : action === "save_reward"
              ? { op: "save_reward", reward: body.reward || {} }
              : { op: "delete_reward", id: body.id };
      const outcome = await executeAction(payload, "panel");
      return NextResponse.json({ ok: outcome.ok, result: outcome });
    }

    return bad(`action غير معروف: ${action}`, 400);
  } catch (error) {
    return bad(String((error as Error)?.message || error), 500);
  }
}


