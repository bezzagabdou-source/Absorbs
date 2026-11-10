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
import { listRecentUsers, usersCount, getUser } from "@/lib/users";
import { listContests } from "@/lib/contests";
import { storageInfo } from "@/lib/store";
import { aiStatus } from "@/lib/ai";
import { ALLOWED_OPS, executeAction, planActions, panelStats } from "@/lib/agent";
import { getBotIdentity, tgCall } from "@/lib/telegram";

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
    return ok({
      panel: true,
      passwordSet: Boolean(process.env.ADMIN_PASSWORD),
      secretSet: Boolean(process.env.ADMIN_SECRET),
      ai: aiStatus(),
      storage: storageInfo().backend,
    });
  }
  if (!(await authed(req))) return bad("ماشي مسجّل", 401);
  const url = new URL(req.url);
  const what = url.searchParams.get("what") || "all";

  try {
    if (what === "stats") return ok({ stats: await panelStats(), storage: storageInfo() });

    if (what === "users") {
      const users = await listRecentUsers(300);
      const banned = new Set(await bannedIds());
      const withBalances = await Promise.all(
        users.map(async (u) => ({ ...u, points: await balanceOf(u.id), banned: banned.has(u.id) })),
      );
      return ok({ users: withBalances, total: await usersCount() });
    }

    if (what === "ai_status") return ok({ ai: aiStatus(), ops: ALLOWED_OPS });

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

  if (action === "logout") {
    const jar = await cookies();
    jar.delete(COOKIE);
    return ok({ loggedOut: true });
  }

  if (!(await authed(req))) return bad("ماشي مسجّل", 401);

  try {
    // 🤖 وكيل الذكاء الاصطناعي
    if (action === "ai") {
      const prompt = String(body.prompt || "").trim();
      if (!prompt) return bad("اكتب طلبك", 400);
      const out = await planActions(prompt);
      return NextResponse.json({ ...out });
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


