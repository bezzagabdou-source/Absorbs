import { NextResponse, type NextRequest } from "next/server";
import { handleUpdate } from "@/lib/bot";
import { getSettings } from "@/lib/settings";
import type { TgUpdate } from "@/lib/telegram";

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

  try {
    await handleUpdate(update);
  } catch (error) {
    console.error("[webhook] failed to handle update", error);
  }

  return NextResponse.json({ ok: true });
}
