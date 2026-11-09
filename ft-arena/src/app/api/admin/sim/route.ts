/**
 * محاكاة تحديثات تيليجرام على البوت الحقيقي (نفس مسار الـ webhook ونفس الشيفرة).
 * محميّ بسرّ الـ webhook: POST /api/admin/sim {secret, update, userId}
 * يعيد ردود البوت كما أرسلها إلى تيليجرام + وثيقة المستخدم بعد المعالجة.
 */
import { env } from "@/lib/env";
import { handleUpdate } from "@/lib/bot";
import { loadDB, mutate } from "@/lib/store";
import type { TgUpdate } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Captured = { method: string; chat_id?: unknown; text?: string; markup?: unknown };

const g = globalThis as typeof globalThis & { __sim?: Captured[] };


export async function GET(req: Request) {
  const u = new URL(req.url);
  if ((u.searchParams.get("key") ?? "") !== env.webhookSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const uid = Number(u.searchParams.get("uid") ?? 900000001);
  const text = u.searchParams.get("text") ?? "/start";
  const member = u.searchParams.get("member") ?? "member";
  const data = u.searchParams.get("data");
  const from = { id: uid, first_name: "فحص", username: "probe", language_code: "ar" };
  const update: TgUpdate = data
    ? {
        update_id: Date.now(),
        callback_query: {
          id: "probe",
          from,
          data,
          message: { message_id: 1, chat: { id: uid, type: "private" }, date: Math.floor(Date.now() / 1000) },
        } as TgUpdate["callback_query"],
      }
    : {
        update_id: Date.now(),
        message: { message_id: 1, from, chat: { id: uid, type: "private" }, date: Math.floor(Date.now() / 1000), text },
      };
  return run(update, uid, member);
}

export async function POST(req: Request) {
  let body: {
    secret?: string;
    update?: TgUpdate;
    userId?: number;
    /** "member" | "left" | "fail" — يجعل getChatMember يُرجع هذه الحالة */
    member?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if ((body.secret ?? "") !== env.webhookSecret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const update = body.update;
  if (!update) return Response.json({ ok: false, error: "no update" }, { status: 400 });
  return run(update, body.userId, body.member);
}

async function run(
  update: TgUpdate,
  userIdHint?: number,
  memberHint?: string
) {

  // نلتقط نداءات تيليجرام بدل إرسالها فعليًا
  const original = globalThis.fetch;
  const tgBase = /^(.*)\/bot[^/]*$/.exec(`https://api.telegram.org/bot${env.botToken}`)?.[1] ?? "https://api.telegram.org";
  const calls: Captured[] = (g.__sim = []);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const passthrough = memberHint === "real" && url.includes("/getChatMember");
    if (url.startsWith(tgBase) && !passthrough) {
      const method = url.split("/").filter(Boolean).pop() ?? "";
      if (process.env.SIM_DEBUG) calls.push({ method: `DBG:${url}`, text: String(init?.body ?? "").slice(0, 80) });
      let payload: Record<string, unknown> = {};
      try {
        payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      } catch {
        /* ignore */
      }
      // memberHint === "real" → نترك النداء يذهب إلى تيليجرام الحقيقي
      if (method === "getChatMember" && memberHint !== "real") {
        const status = memberHint || "member";
        calls.push({ method, chat_id: payload.chat_id, text: `mock:${status}` });
        return new Response(
          JSON.stringify(
            status === "fail"
              ? { ok: false, error_code: 400, description: "Bad Request: member list is inaccessible" }
              : { ok: true, result: { status, user: { id: payload.user_id, is_bot: false, first_name: "x" } } }
          ),
          { headers: { "content-type": "application/json" } }
        );
      }
      calls.push({
        method,
        chat_id: payload.chat_id,
        text: typeof payload.text === "string" ? payload.text : typeof payload.caption === "string" ? payload.caption : undefined,
        markup: payload.reply_markup,
      });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 1, chat: { id: payload.chat_id } } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return original(input as RequestInfo, init);
  }) as typeof fetch;

  try {
    await mutate(async (db) => {
      await handleUpdate(update, db, { username: db.meta.botUsername, name: db.meta.botName });
      return true;
    });
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message.slice(0, 300), calls }, { status: 200 });
  } finally {
    globalThis.fetch = original;
  }

  const db = await loadDB();
  const uid = String(userIdHint ?? update.message?.from?.id ?? update.callback_query?.from?.id ?? "");
  const u = db.users[uid];
  return Response.json({
    ok: true,
    calls,
    user: u
      ? { id: u.id, points: u.points, totalEarned: u.totalEarned, tasks: u.tasks, daily: u.daily, banned: u.banned, refCount: u.refCount }
      : null,
    forceJoin: { enabled: db.settings.forceJoin.enabled, username: db.settings.forceJoin.username, verify: db.settings.forceJoin.verify, url: db.settings.forceJoin.url },
    counters: db.counters,
  });
}
