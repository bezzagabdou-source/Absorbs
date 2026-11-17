import { after } from "next/server";
import { bootstrap, ensureWebhook } from "@/lib/bootstrap";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(): Promise<Response> {
  const result = await bootstrap();
  let webhook = result.webhook;
  if (result.bot && !webhook) {
    const forced = await ensureWebhook(true);
    webhook = forced.url;
  }
  return Response.json({
    ok: result.db && result.bot,
    site: env.siteUrl,
    webhook,
    error: result.error ?? null,
    at: new Date().toISOString(),
  });
}

export async function GET(): Promise<Response> {
  return run();
}

export async function POST(): Promise<Response> {
  try {
    after(async () => {
      await run();
    });
  } catch {
    /* ignore */
  }
  return Response.json({ ok: true });
}
