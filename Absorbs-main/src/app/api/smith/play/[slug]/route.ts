import { serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { db } from "@/db";
import { smithGames } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 30;

const SLUG_RE = /^[a-z0-9\u0600-\u06FF-]{3,64}$/i;

/**
 * GET /api/smith/play/:slug → the game file itself, so a shared link works for
 * anyone (no login) and plays in a plain iframe.
 *
 * Security notes, on purpose:
 *  - only SMITH-engine games are served as HTML from our own origin. Those files
 *    are assembled by our engine from a sanitised config (title / hero name are
 *    stripped of < >), so there is no user-authored JavaScript involved.
 *  - AI-generated projects are never streamed from our origin here; their owner
 *    previews them in the sandboxed iframe the app already uses.
 *  - private games need a signed-in owner.
 *  - a strict CSP keeps a served file from talking to anything at all.
 */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug: raw } = await ctx.params;
    const slug = (raw ?? "").trim();
    if (!SLUG_RE.test(slug)) return text(404, "not found");

    const rows = await db
      .select({
        id: smithGames.id,
        html: smithGames.html,
        title: smithGames.title,
        engine: smithGames.engine,
        visibility: smithGames.visibility,
        userId: smithGames.userId,
      })
      .from(smithGames)
      .where(eq(smithGames.slug, slug))
      .limit(1)
      .catch(() => []);
    const game = rows[0];
    if (!game) return text(404, "لعبة غير موجودة — Game not found");

    const user = await verifyRequest(req).catch(() => null);
    const owner = !!user && user.uid === game.userId;
    if (game.visibility === "private" && !owner)
      return text(403, "هذه اللعبة خاصة — This game is private");
    if (game.engine !== "smith" && !owner)
      return text(403, "هذه اللعبة لا تُشارك كرابط مباشر — Not shareable as a direct link");

    // one play per minute per visitor+game, so a refresh loop cannot inflate the counter
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
    if (rateLimit(`play:${ip}:${slug}`, 6, 60_000).ok) {
      await db
        .update(smithGames)
        .set({ plays: sql`${smithGames.plays} + 1` })
        .where(eq(smithGames.id, game.id))
        .execute()
        .catch(() => undefined);
    }

    return new Response(game.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (e) {
    return serverError("smith:play", e, "DB");
  }
}

function text(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
