import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { addPackByLink, discoveryStep, removeEmoji, removePack, setEmoji } from "@/lib/emojiDiscovery";
import { emojiStatus, sampleMessages, setMode, snapshotScreens, testCapabilities, testCore, testFallback, testOne } from "@/lib/emojiOps";
import { pushAdminLog } from "@/lib/rewards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** ✨ صفحة «الإيموجي» في لوحة ft-panel — نفس حماية /api/panel/manage (x-panel-key) */
function authorized(request: NextRequest) {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(
    request.headers.get("x-panel-key") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""),
  );
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return reply({ ok: false, error: "unauthorized" }, 401);
  try {
    const url = new URL(request.url);
    return reply(await emojiStatus({ q: url.searchParams.get("q") || "", limit: Number(url.searchParams.get("limit")) || 150 }));
  } catch (error) {
    console.error("[panel/emoji] GET", error);
    return reply({ ok: false, error: "تعذّر قراءة حالة الإيموجي" }, 500);
  }
}

const text = (value: unknown, max = 200) => String(value ?? "").trim().slice(0, max);

export async function POST(request: NextRequest) {
  if (!authorized(request)) return reply({ ok: false, error: "unauthorized" }, 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return reply({ ok: false, error: "JSON غير صالح" }, 400);
  }
  const op = text(body.op, 40);
  const log = (detail: string) => pushAdminLog({ at: Date.now(), op: `emoji_${op}`, detail: detail.slice(0, 300), via: "panel" }).catch(() => undefined);
  try {
    switch (op) {
      case "discover": {
        const result = await discoveryStep({ restart: body.restart === true, budgetMs: 35_000 });
        if (result.done) await log(`اكتشاف: ${result.verified} باقة، ${result.emojis} إيموجي، ${result.failed} فشل`);
        return reply({ ...result, op });
      }
      case "add_pack": {
        const result = await addPackByLink(text(body.link, 200));
        await log(result.message);
        return reply({ ...result, op }, result.ok ? 200 : 400);
      }
      case "remove_pack": {
        const result = await removePack(text(body.name, 80));
        await log(result.message);
        return reply({ ...result, op }, result.ok ? 200 : 400);
      }
      case "set_emoji": {
        const result = await setEmoji(text(body.emoji, 40), text(body.id, 30));
        await log(result.message);
        return reply({ ...result, op }, result.ok ? 200 : 400);
      }
      case "remove_emoji": {
        const result = await removeEmoji(text(body.emoji, 40));
        await log(result.message);
        return reply({ ...result, op }, result.ok ? 200 : 400);
      }
      case "mode": {
        const result = await setMode(text(body.mode, 20));
        await log(result.message);
        return reply({ ...result, op }, result.ok ? 200 : 400);
      }
      case "test_caps":
        return reply({ op, ...(await testCapabilities()) });
      case "test_core":
        return reply({ op, ...(await testCore()) });
      case "test_one":
        return reply({ op, ...(await testOne(text(body.emoji, 40))) });
      case "test_fallback":
        return reply({ op, ...(await testFallback()) });
      case "snapshot":
        return reply({ op, ...(await snapshotScreens(Array.isArray(body.screens) ? body.screens.map((s) => text(s, 20)) : undefined)) });
      case "samples":
        return reply({ op, ...(await sampleMessages()) });
      default:
        return reply({ ok: false, error: "عملية غير معروفة" }, 400);
    }
  } catch (error) {
    console.error("[panel/emoji] POST", op, error);
    return reply({ ok: false, error: `فشلت العملية: ${String((error as Error)?.message || error).slice(0, 200)}` }, 500);
  }
}
