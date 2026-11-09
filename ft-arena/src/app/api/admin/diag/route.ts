/**
 * تشخيص إنتاجي (GET) — يكشف سبب «البوت ما يردّش» و«النقاط ما تتحسبش».
 * محميّ بسرّ الـ webhook: /api/admin/diag?key=...
 */
import { env } from "@/lib/env";
import { loadDB, mutate, storeMode } from "@/lib/store";
import { safeTg } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if ((url.searchParams.get("key") ?? "") !== env.webhookSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const out: Record<string, unknown> = {};
  const t = (ms: number) => `${ms}ms`;

  // 0) الإعدادات الحرجة (بدون كشف أي سرّ)
  out.env = {
    hasBotToken: Boolean(env.botToken),
    botTokenShape: env.botToken ? `${env.botToken.split(":")[0].slice(0, 3)}…:${env.botToken.split(":")[1]?.length ?? 0}ch` : null,
    hasRedis: Boolean(env.redisUrl),
    redisProto: (env.redisUrl || "").split("://")[0] || null,
    hasBlob: Boolean(env.blobToken),
    hasGroq: Boolean((process.env.GROQ_API_KEY ?? "").trim()),
    webhookSecretSet: Boolean(env.webhookSecret && env.webhookSecret !== "mx-hook"),
    adminPasswordSet: Boolean(env.adminPassword),
    httpTimeoutMs: env.httpTimeoutMs,
    vercel: env.isVercel,
  };

  // 1) وضع التخزين + قياس سرعته
  let modeStart = Date.now();
  out.storeMode = await storeMode();
  out.storeModeMs = t(Date.now() - modeStart);

  // 2) كتابة/قراءة حقيقية على Redis (مفتاح مؤقت — لا يلمس قاعدة البيانات)
  const rwStart = Date.now();
  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 5000, lazyConnect: true });
    await client.connect();
    const ping = await client.ping();
    const key = "mx:diag:probe";
    await client.set(key, String(Date.now()), "EX", 60);
    const back = await client.get(key);
    await client.del(key);
    out.redis = { ping, writeReadOk: Boolean(back), ms: t(Date.now() - rwStart) };
    await client.quit();
  } catch (e) {
    out.redis = { error: (e as Error).message.slice(0, 200), ms: t(Date.now() - rwStart) };
  }

  // 2.2) كل متغيّرات البيئة التي تشبه روابط Redis — هل هناك أكثر من واحد؟
  out.redisCandidates = Object.entries(process.env)
    .filter(([k]) => !k.startsWith("NEXT_PUBLIC_"))
    .filter(([, v]) => /^rediss?:\/\//i.test((v ?? "").trim()))
    .map(([k, v]) => {
      try {
        const u = new URL((v ?? "").trim());
        return { name: k, host: u.host, db: u.pathname || "/0" };
      } catch {
        return { name: k, host: "unparseable" };
      }
    });
  out.redisChosen = env.redisUrlSource || "(none)";

  // 2.5) أسرار التخزين: نفس المضيف؟ نفس المفتاح؟ (بدون كشف الرابط)
  try {
    const { default: Redis } = await import("ioredis");
    const c = new Redis(env.redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 4000, lazyConnect: true });
    await c.connect();
    const host = new URL(env.redisUrl).host;
    const raw = await c.get("mx:db:v1");
    let parsed: { users?: Record<string, unknown>; updatedAt?: string; settings?: { botName?: string } } | null = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    out.rawKey = {
      host,
      bytes: raw ? raw.length : 0,
      users: parsed?.users ? Object.keys(parsed.users).length : 0,
      updatedAt: parsed?.updatedAt ?? null,
      botName: parsed?.settings?.botName ?? null,
      userSample: parsed?.users ? Object.keys(parsed.users).slice(0, 8) : [],
      ttl: await c.ttl("mx:db:v1"),
      dbSize: await c.dbsize(),
    };
    await c.quit();
  } catch (e) {
    out.rawKey = { error: (e as Error).message.slice(0, 200) };
  }

  // 3) قاعدة البيانات كما يراها البوت
  const dbStart = Date.now();
  try {
    const db = await loadDB();
    out.db = {
      ms: t(Date.now() - dbStart),
      updatedAt: db.updatedAt,
      keys: Object.keys(db.users).length,
      users: Object.values(db.users).filter((u) => u.status !== "left").length,
      rewards: db.rewards.length,
      tasks: db.tasks.length,
      contests: db.contests.length,
      activity: db.activity.length,
      lastError: db.meta.lastError ?? null,
      recentErrors: db.activity.filter((a) => (a.icon ?? "").includes("⚠")).slice(0, 5),
      lastActivity: db.activity.slice(0, 5).map((a) => `${a.at} ${a.icon} ${a.title}`),
    };
  } catch (e) {
    out.db = { error: (e as Error).message.slice(0, 300) };
  }

  // 4) هل الكتابة عبر mutate() تنجح فعلًا؟
  const mutStart = Date.now();
  try {
    const probe = await mutate((db) => {
      const stamp = new Date().toISOString();
      (db.meta as Record<string, unknown>).diag = stamp;
      return stamp;
    });
    const after = await loadDB();
    out.mutate = { wrote: probe, visibleOnReload: (after.meta as Record<string, unknown>).diag === probe, ms: t(Date.now() - mutStart) };
  } catch (e) {
    out.mutate = { error: (e as Error).message.slice(0, 300), ms: t(Date.now() - mutStart) };
  }

  // 5) حالة الـ webhook الحقيقية عند تيليجرام
  try {
    const info = await safeTg<{
      url?: string;
      has_custom_certificate?: boolean;
      pending_update_count?: number;
      ip_address?: string;
      last_error_date?: number;
      last_error_message?: string;
      max_connections?: number;
      allowed_updates?: string[];
    }>("getWebhookInfo");
    out.webhook = info
      ? {
          ...info,
          url: info.url ? info.url.replace(/\/api\/tg\/.*$/, "/api/tg/•") : "",
          host: info.url ? new URL(info.url).host : null,
          lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : null,
        }
      : "no response from telegram";
  } catch (e) {
    out.webhook = { error: (e as Error).message.slice(0, 200) };
  }

  // 6) هل يمكن للبوت التحقق من الاشتراك؟
  try {
    const me = await safeTg<{ id: number; username: string }>("getMe");
    const chat = env.adminChatId;
    out.bot = me ? { id: me.id, username: me.username } : "getMe failed";
    if (me) {
      const member = await safeTg<{ status: string }>("getChatMember", {
        chat_id: `@${(await loadDB()).settings.forceJoin.username.replace(/^@/, "")}`,
        user_id: me.id,
      });
      out.canVerifyJoin = member ? { status: member.status, ok: member.status === "administrator" || member.status === "creator" } : "cannot read members (bot is not admin)";
    }
    void chat;
  } catch (e) {
    out.bot = { error: (e as Error).message.slice(0, 200) };
  }

  return Response.json({ ok: true, at: new Date().toISOString(), ...out });
}
