import { NextResponse, type NextRequest } from "next/server";
import { handleUpdate } from "@/lib/bot";
import { getSettings } from "@/lib/settings";
import { trackBotMessage } from "@/lib/stats";
import { getTrace, type TgUpdate } from "@/lib/telegram";

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

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({
    ok: true,
    endpoint: "telegram-webhook",
    configured: Boolean(settings.botToken),
    secretProtected: Boolean(settings.webhookSecret),
  });
}

export async function POST(request: NextRequest) {
  const settings = await getSettings();
  const secret = settings.webhookSecret;

  if (secret) {
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    const querySecret = new URL(request.url).searchParams.get("secret");
    if (headerSecret !== secret && querySecret !== secret) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
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

  return NextResponse.json({ ok: true });
}
