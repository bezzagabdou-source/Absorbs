import { NextResponse, type NextRequest } from "next/server";
import { notifyPointsMilestone } from "@/lib/bot";
import { creditPoints } from "@/lib/points";
import { getSettings } from "@/lib/settings";
import { isMock } from "@/lib/telegram";
import { getUser } from "@/lib/users";

export const dynamic = "force-dynamic";

/** محاكاة فقط: نمنح جهات لمستخدم باش نختبرو النقاط (معطل في الإنتاج) */
export async function POST(request: NextRequest) {
  if (!isMock()) return NextResponse.json({ ok: false, error: "mock disabled" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { userId?: string | number; amount?: number };
  const userId = String(body.userId || "").trim();
  const amount = Math.max(1, Math.min(1000, Number(body.amount) || 1));
  if (!/^\d+$/.test(userId)) {
    return NextResponse.json({ ok: false, error: "userId مطلوب" }, { status: 400 });
  }
  const result = await creditPoints(userId, amount);
  if (result.milestone) {
    const user = await getUser(userId);
    const settings = await getSettings();
    if (user) await notifyPointsMilestone(user, settings, result.state, result.milestone);
  }
  return NextResponse.json({ ok: true, ...result });
}
