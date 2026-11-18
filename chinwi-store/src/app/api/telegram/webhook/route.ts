import { after } from "next/server";
import { handleUpdate } from "@/lib/bot";
import { env } from "@/lib/env";
import { ensureDb } from "@/lib/db";
import type { TgUpdate } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (env.webhookSecret && secret !== env.webhookSecret) {
    return new Response("forbidden", { status: 401 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: true });
  }

  try {
    await ensureDb();
  } catch (err) {
    console.error("[webhook] db not ready", err);
    return Response.json({ ok: false, error: "db" }, { status: 200 });
  }

  try {
    after(() => handleUpdate(update));
  } catch {
    void handleUpdate(update);
  }
  return Response.json({ ok: true });
}

export async function GET(): Promise<Response> {
  return Response.json({ ok: true, service: "chinwi-store-bot", at: new Date().toISOString() });
}
