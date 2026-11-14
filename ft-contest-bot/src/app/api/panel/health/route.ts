/**
 * 🩺 فحص ربط اللوحة بالبوت — نداء قراءة فقط للمفتاح الصحيح.
 *
 * الهدف: اللوحة تعرف *بالضبط* هل البوت المنشور يدعم مسارات اللوحة أم لا،
 * بدل رسالة 404 غامضة. لا يكشف أي سر: فقط هوية البوت وحالة التخزين.
 */
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSettings } from "@/lib/settings";
import { storageInfo } from "@/lib/store";
import { isMock, tgCall } from "@/lib/telegram";
import { usersCount } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** المسارات التي تعتمد عليها لوحة ft-panel */
const CAPABILITIES = ["health", "manage", "referrals", "rewards", "agent", "chat", "vision", "stickers", "migrate"];

const reply = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

function authorized(request: NextRequest): boolean {
  const expected = Buffer.from(process.env.PANEL_PUBLIC_KEY || "");
  const provided = Buffer.from(
    request.headers.get("x-panel-key") || (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""),
  );
  return expected.length > 0 && expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return reply({ ok: false, error: "unauthorized" }, 401);
  try {
    const settings = await getSettings();
    let telegram: { ok: boolean; username: string; webhook: string | null } = { ok: false, username: "", webhook: null };
    if (!isMock()) {
      const me = await tgCall<{ username?: string }>("getMe").catch(() => ({ ok: false }) as { ok: boolean });
      const hook = await tgCall<{ url?: string }>("getWebhookInfo").catch(() => ({ ok: false }) as { ok: boolean });
      telegram = {
        ok: Boolean(me.ok),
        username: (me as { result?: { username?: string } }).result?.username || settings.botUsername || "",
        webhook: (hook as { result?: { url?: string } }).result?.url || null,
      };
    }
    return reply({
      ok: true,
      service: "ft-contest-bot",
      panel: "ft-panel",
      capabilities: CAPABILITIES,
      storage: storageInfo(),
      telegram,
      users: await usersCount().catch(() => 0),
      commit: process.env.VERCEL_GIT_COMMIT_SHA || "",
      at: Date.now(),
    });
  } catch {
    return reply({ ok: false, error: "تعذّر قراءة حالة البوت" }, 500);
  }
}
