import { NextResponse, type NextRequest } from "next/server";
import { handleUpdate } from "@/lib/bot";
import { getSettings } from "@/lib/settings";
import { trackBotMessage } from "@/lib/stats";
import { getTrace, runWithBotToken, secondBotToken, type TgUpdate } from "@/lib/telegram";

export type AuditEntry = {
  at: number;
  kind: string;
  chatId: number | string;
  userId: number | string;
  name: string;
  text: string;
  error: string | null;
  sent?: { method: string; text?: string; error?: string }[];
};

const AUDIT_KEY = "audit:updates";
const META_KEY = "bot:meta";
const ALERT_KEY = "bot:alertAt";

function describeUpdate(update: TgUpdate) {
  if (update.callback_query) {
    const q = update.callback_query;
    return {
      kind: "callback",
      chatId: q.message?.chat.id ?? q.from.id,
      userId: q.from.id,
      name: q.from.first_name || q.from.username || "",
      text: q.data || "",
    };
  }
  if (update.message) {
    const m = update.message;
    return {
      kind: m.chat.type,
      chatId: m.chat.id,
      userId: m.from?.id ?? m.chat.id,
      name: m.from?.first_name || m.from?.username || "",
      text: m.text || "",
    };
  }
  if (update.chat_join_request) {
    const r = update.chat_join_request;
    return { kind: "join", chatId: r.chat.id, userId: r.from.id, name: r.from.first_name || "", text: r.invite_link?.name || "" };
  }
  if (update.my_chat_member) {
    const m = update.my_chat_member;
    return { kind: "my_chat_member", chatId: m.chat.id, userId: m.from.id, name: m.chat.title || "", text: m.new_chat_member.status };
  }
  return { kind: "other", chatId: 0, userId: 0, name: "", text: "" };
}

/** 🩺 نسجّل بوت الحقيقة لي كيتصل بيه السيرفر (التوكن الفعّال) */
async function saveBotMeta() {
  const { getStore } = await import("@/lib/store");
  const { tgCall } = await import("@/lib/telegram");
  const [me, info] = await Promise.all([
    tgCall<{ id: number; username?: string }>("getMe", {}),
    tgCall<{ url?: string; pending_update_count?: number; last_error_message?: string }>("getWebhookInfo", {}),
  ]);
  const payload = {
    tokenBotId: Number((process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || "").split(":")[0]) || 0,
    identity: me.result ? { id: me.result.id, username: me.result.username || "" } : null,
    url: info.result?.url || "",
    pending: info.result?.pending_update_count || 0,
    error: info.result?.last_error_message || null,
    at: Date.now(),
  };
  await getStore().set(META_KEY, payload);
}

export async function readBotMeta() {
  const { getStore } = await import("@/lib/store");
  return getStore().get<Record<string, unknown>>(META_KEY);
}

/** 🚨 تنبيه المالك إذا البوت ما قدرش يبعث (مرة ف كل 5 دقايق ماكس) */
async function alertOwner(reason: string) {
  const { getStore } = await import("@/lib/store");
  const lastAt = Number((await getStore().get<number>(ALERT_KEY)) || 0);
  if (Date.now() - lastAt < 5 * 60_000) return;
  const { getSettings } = await import("@/lib/settings");
  const { sendMessage } = await import("@/lib/telegram");
  const s = await getSettings();
  const who = (s.adminIds || []).find((x) => /^\d+$/.test(x)) || (/^\d+$/.test(s.ownerUsername) ? s.ownerUsername : "");
  if (!who) return;
  await sendMessage(who, `🚨 البوت ما قدرش يبعث رسالة\nالسبب: ${reason.slice(0, 200)}`);
  await getStore().set(ALERT_KEY, Date.now());
}

async function pushAudit(entry: AuditEntry & { sent?: { method: string; text?: string; error?: string }[] }) {
  const { getStore } = await import("@/lib/store");
  // نلتقطو آخر نداءات الإرسال من الأثر (إلا كان التسجيل مفعّل)
  const trace = getTrace().slice(0, 6).map((t) => ({ method: t.method, text: String(t.payload.text || "").slice(0, 200) }));
  const store = getStore();
  await store.listPush(AUDIT_KEY, [JSON.stringify({ ...entry, sent: trace })]);
  const len = await store.listLen(AUDIT_KEY);
  if (len > 120) {
    const all = (await store.listAll(AUDIT_KEY, 200)).slice(-120);
    await store.delList(AUDIT_KEY);
    await store.listPush(AUDIT_KEY, all);
  }
}

export async function readAudit(limit = 40): Promise<AuditEntry[]> {
  const { getStore } = await import("@/lib/store");
  const raw = await getStore().listAll(AUDIT_KEY, 300);
  return raw
    .map((line) => {
      try {
        return JSON.parse(line) as AuditEntry;
      } catch {
        return null;
      }
    })
    .filter((x): x is AuditEntry => Boolean(x))
    .slice(-limit)
    .reverse();
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const settings = await getSettings();
  const url = new URL(request.url);
  const key = url.searchParams.get("key") || request.headers.get("x-panel-key") || "";
  const expectedKey = process.env.PANEL_PUBLIC_KEY || "";
  const wantsInfo = url.searchParams.get("what") === "info";

  // 🔎 تشخيص الويب هوك: يخدم غير بمفتاح اللوحة (باش ما ينكشفش للعامة)
  if (wantsInfo && expectedKey && key === expectedKey) {
    const { tgCall, getBotIdentity } = await import("@/lib/telegram");
    const [me, info] = await Promise.all([
      getBotIdentity(),
      tgCall<{ url?: string; pending_update_count?: number; last_error_message?: string; allowed_updates?: string[] }>(
        "getWebhookInfo",
        {},
      ),
    ]);
    const expected = `${new URL(request.url).origin}/api/telegram/webhook`;
    return NextResponse.json({
      ok: info.ok,
      identity: me,
      webhook: {
        url: info.result?.url || "",
        pending: info.result?.pending_update_count ?? -1,
        lastError: info.result?.last_error_message || null,
        allowedUpdates: info.result?.allowed_updates || [],
        expected,
        matches: (info.result?.url || "") === expected,
      },
    });
  }

  return NextResponse.json({
    ok: true,
    endpoint: "telegram-webhook",
    configured: Boolean(settings.botToken),
    secretProtected: Boolean(settings.webhookSecret),
  });
}

export async function POST(request: NextRequest) {
  const settings = await getSettings();
  // 🛟 نقبلو أي سر معروف للبوت (المخزّن أو من البيئة) — بعد تبديل سر الويب هوك
  //    كان الويب هوك يرجع 401 ويبقى البوت ساكت.
  const accepted = [settings.webhookSecret, process.env.TELEGRAM_WEBHOOK_SECRET, process.env.WEBHOOK_SECRET]
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  const headerSecret = String(request.headers.get("x-telegram-bot-api-secret-token") || "");
  const querySecret = String(new URL(request.url).searchParams.get("secret") || "");

  if (accepted.length) {
    const good = accepted.some((sec) => sec === headerSecret || sec === querySecret);
    if (!good) {
      console.warn("[webhook] unauthorized — secret mismatch", {
        hasHeader: Boolean(headerSecret),
        hasQuery: Boolean(querySecret),
      });
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  // 🧩 أي بوت؟ البوت الثاني كيتسجّل على نفس الرابط بعلامة ?bot=2 — نفس المتجر والبيانات
  const which = new URL(request.url).searchParams.get("bot");
  const second = secondBotToken();
  if (which === "2" && second) return await runWithBotToken(second, () => handleWebhook(update));

  return await handleWebhook(update);
}

async function handleWebhook(update: TgUpdate) {
  const settings = await getSettings();

  // 🩺 نسجّلو هوية البوت + حالة الويب هوك ف كل تحديث (باش نعرفو واش الإرسال يخدم)
  try {
    await saveBotMeta();
  } catch {
    /* ما نعطّلوش الردّ */
  }

  await trackBotMessage();

  // 🩺 تدقيق: آخر 40 تحديث وصلو + شنو ردّ البوت عليهم/أي خطأ (للتشخيص من اللوحة)
  const detail = describeUpdate(update);
  let error: string | null = null;
  try {
    await handleUpdate(update);
  } catch (e) {
    error = String((e as Error)?.message || e);
    console.error("[webhook] failed to handle update", e);
  }
  try {
    await pushAudit({ at: Date.now(), ...detail, error });
  } catch {
    /* التدقيق ما يعطّلش الردّ */
  }

  // 🚨 إلا فشل الإرسال لتّيليغرام، نبلغو المالك على الخاص (باش ما نبقاوش في السكوت)
  try {
    const { getSendErrors } = await import("@/lib/telegram");
    const errs = getSendErrors().filter((e) => Date.now() - e.at < 20_000);
    if (errs.length) await alertOwner(errs[0].error);
  } catch {
    /* تنبيه فقط */
  }

  return NextResponse.json({ ok: true });
}
