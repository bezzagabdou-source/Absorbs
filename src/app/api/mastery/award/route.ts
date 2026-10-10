import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { award, XP_AMOUNT, type XpAction } from "@/lib/mastery";
import { db } from "@/db";
import { smithGames } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Only these actions may be claimed from the browser — everything else (build,
 * publish, score) is awarded by the route that actually did the work, so a
 * caller cannot mint XP by POSTing a name.
 */
const CLAIMABLE: XpAction[] = ["smith_play", "smith_like"];

/** POST { action, slug? } → award XP for one verifiable client-side action. */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  // generous per minute, hard cap per hour: XP must never be farmable by a loop
  if (!rateLimit(`award:${user.uid}`, 30, 60_000).ok) return json(429, { code: "RATE" });
  if (!rateLimit(`awardh:${user.uid}`, 240, 3_600_000).ok)
    return json(429, { code: "RATE_HOUR" }, { "Retry-After": "3600" });

  let body: { action?: unknown; slug?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const action = typeof body.action === "string" ? body.action : "";
  if (!CLAIMABLE.includes(action as XpAction)) return json(400, { code: "BAD_ACTION" });

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!slug || !/^[a-z0-9\u0600-\u06FF-]{3,64}$/i.test(slug)) return json(400, { code: "BAD_SLUG" });

  try {
    await ensureUser(user);
    // the game must really exist — no XP for invented slugs
    const games = await db
      .select({ id: smithGames.id, userId: smithGames.userId })
      .from(smithGames)
      .where(eq(smithGames.slug, slug))
      .limit(1);
    const game = games[0];
    if (!game) return json(404, { code: "NO_GAME" });

    if (action === "smith_like") {
      if (game.userId === user.uid) return json(400, { code: "SELF_LIKE" });
      await db
        .update(smithGames)
        .set({ likes: sql`${smithGames.likes} + 1` })
        .where(eq(smithGames.id, game.id))
        .execute()
        .catch(() => undefined);
    }

    const xp = await award(user.uid, action as XpAction, { count: 1 });
    return json(200, {
      ok: true,
      action,
      amount: XP_AMOUNT[action as XpAction] ?? 0,
      xp,
    });
  } catch (e) {
    return serverError("mastery:award", e, "DB");
  }
}
