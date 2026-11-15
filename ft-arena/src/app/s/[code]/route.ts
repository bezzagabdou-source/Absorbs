/**
 * اختصار الروابط داخل البوت — /s/<refCode> يسجل الزيارة ثم يحوّل إلى تيليجرام.
 * مفيد لمشاركة رابط قصير على السوشيال ميديا.
 */
import { env } from "@/lib/env";
import { mutate } from "@/lib/store";
import { pushEvent } from "@/lib/store";
import { findByRefCode } from "@/lib/bot-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const db = await mutate((d) => {
    d.counters.visits += 1;
    d.counters.visitsToday += 1;
    const u = findByRefCode(d, code);
    pushEvent(d, "visit", u?.id, code);
    return { bot: d.meta.botUsername, valid: Boolean(u) };
  });
  const target = db.bot
    ? `https://t.me/${db.bot}?start=${encodeURIComponent(code)}`
    : `https://t.me/share/url?url=${encodeURIComponent(env.siteUrl)}`;
  return Response.redirect(target, 302);
}
