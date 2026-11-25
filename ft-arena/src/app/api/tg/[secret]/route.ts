/**
 * مستقبل تحديثات تيليجرام (Webhook).
 * الرابط: /api/tg/<WEBHOOK_SECRET>
 */
import { env } from "@/lib/env";
import { handleUpdate } from "@/lib/bot";
import { mutate, logActivity } from "@/lib/store";
import type { TgUpdate } from "@/lib/tg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (secret !== env.webhookSecret) return Response.json({ ok: false }, { status: 404 });
  return Response.json({ ok: true, info: "مسابقات MX webhook endpoint" });
}

export async function POST(req: Request, ctx: { params: Promise<{ secret: string }> }) {
  const { secret } = await ctx.params;
  if (secret !== env.webhookSecret) return Response.json({ ok: false }, { status: 404 });

  // تحقق إضافي من ترويسة تيليجرام الرسمية
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  if (header && header !== env.webhookSecret) return Response.json({ ok: false }, { status: 401 });

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  try {
    await mutate(async (db) => {
      const botInfo = { username: db.meta.botUsername, name: db.meta.botName };
      try {
        await handleUpdate(update, db, botInfo);
      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.error("[bot] handler error:", msg);
        db.meta.lastError = `${new Date().toISOString()} — ${msg}`;
        logActivity(db, { actor: "system", icon: "⚠️", title: "خطأ أثناء معالجة تحديث", detail: msg.slice(0, 300) });
      }
      return true;
    });
  } catch (e) {
    console.error("[webhook] fatal:", (e as Error).message);
  }
  // يجب الرد 200 دائمًا حتى لا يعيد تيليجرام الإرسال
  return Response.json({ ok: true });
}
