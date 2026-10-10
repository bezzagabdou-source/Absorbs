import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { award } from "@/lib/mastery";
import { db } from "@/db";
import { smithGames, smithScores, masteryProfiles, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SCORE = 5_000_000;
/** below this run length a huge score is physically impossible */
const MIN_RUN_MS = 4_000;
const SCORE_SANITY_PER_SECOND = 900;

const SLUG_RE = /^[a-z0-9\u0600-\u06FF-]{3,64}$/i;

/**
 * POST { slug, score, level?, durationMs?, handle? }
 * → records one run, updates the game's best score, awards XP, and returns the
 *   player's rank on that board plus the top 10.
 *
 * Cheating is expensive to police properly, so the honest, cheap guards are in
 * place: integer bounds, a rate limit, a minimum run length, and a
 * points-per-second ceiling that scales with the level reached.
 */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`smiths:${user.uid}`, 40, 60_000).ok) return json(429, { code: "RATE" });

  let body: { slug?: unknown; score?: unknown; level?: unknown; durationMs?: unknown; handle?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  if (!SLUG_RE.test(slug)) return json(400, { code: "BAD_SLUG" });

  const score = Math.round(Number(body.score));
  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE)
    return json(400, { code: "BAD_SCORE" });
  const level = Math.max(1, Math.min(999, Math.round(Number(body.level) || 1)));
  const durationMs = Math.max(0, Math.min(3_600_000, Math.round(Number(body.durationMs) || 0)));
  if (score > 200 && durationMs < MIN_RUN_MS) return json(400, { code: "RUN_TOO_SHORT" });
  if (durationMs > 0 && score / Math.max(1, durationMs / 1000) > SCORE_SANITY_PER_SECOND * level)
    return json(400, { code: "SCORE_IMPOSSIBLE" });

  const handle =
    (typeof body.handle === "string" ? body.handle : "")
      .replace(/[<>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24) || user.name || user.email?.split("@")[0] || "لاعب";

  try {
    await ensureUser(user);
    const games = await db
      .select({ id: smithGames.id, bestScore: smithGames.bestScore, visibility: smithGames.visibility })
      .from(smithGames)
      .where(eq(smithGames.slug, slug))
      .limit(1);
    const game = games[0];
    if (!game) return json(404, { code: "NO_GAME" });

    await db
      .insert(smithScores)
      .values({ gameId: game.id, userId: user.uid, score, level, durationMs, handle })
      .execute()
      .catch(() => undefined);

    if (score > Number(game.bestScore ?? 0))
      await db
        .update(smithGames)
        .set({ bestScore: score, updatedAt: new Date() })
        .where(eq(smithGames.id, game.id))
        .execute()
        .catch(() => undefined);

    await db
      .update(smithGames)
      .set({ plays: sql`${smithGames.plays} + 1` })
      .where(eq(smithGames.id, game.id))
      .execute()
      .catch(() => undefined);

    const xp = await award(user.uid, "smith_score", { score }).catch(() => null);

    const board = await leaderboard(game.id, 10);
    const rankRows = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(smithScores)
      .where(and(eq(smithScores.gameId, game.id), sql`${smithScores.score} > ${score}`))
      .catch(() => [{ n: 0 }]);

    return json(200, {
      ok: true,
      score,
      rank: Number(rankRows[0]?.n ?? 0) + 1,
      board,
      xp,
    });
  } catch (e) {
    return serverError("smith:score", e, "DB");
  }
}

async function leaderboard(gameId: string, limit: number) {
  const rows = await db
    .select({
      handle: smithScores.handle,
      score: smithScores.score,
      level: smithScores.level,
      durationMs: smithScores.durationMs,
      createdAt: smithScores.createdAt,
      userId: smithScores.userId,
    })
    .from(smithScores)
    .where(eq(smithScores.gameId, gameId))
    .orderBy(desc(smithScores.score))
    .limit(limit)
    .catch(() => []);
  // one entry per player: keep their best run only
  const seen = new Set<string>();
  const out: { handle: string; score: number; level: number; me?: boolean; at: string }[] = [];
  for (const r of rows) {
    if (seen.has(r.userId)) continue;
    seen.add(r.userId);
    out.push({
      handle: r.handle,
      score: Number(r.score ?? 0),
      level: Number(r.level ?? 1),
      at: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
    });
  }
  return out;
}

/**
 * GET ?slug=…       → the board of one game (+ is it yours?)
 * GET ?global=1     → the platform-wide XP board (top players)
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const user = await verifyRequest(req).catch(() => null);

  try {
    if (q.get("global")) {
      const rows = await db
        .select({
          xp: masteryProfiles.xp,
          level: masteryProfiles.level,
          streak: masteryProfiles.streak,
          bestScore: masteryProfiles.bestScore,
          gamesBuilt: masteryProfiles.gamesBuilt,
          name: users.displayName,
          email: users.email,
          userId: masteryProfiles.userId,
        })
        .from(masteryProfiles)
        .innerJoin(users, eq(users.id, masteryProfiles.userId))
        .orderBy(desc(masteryProfiles.xp))
        .limit(25)
        .catch(() => []);
      return json(200, {
        board: rows.map((r) => ({
          name: r.name || r.email?.split("@")[0] || "لاعب",
          xp: Number(r.xp ?? 0),
          level: Number(r.level ?? 1),
          streak: Number(r.streak ?? 0),
          bestScore: Number(r.bestScore ?? 0),
          gamesBuilt: Number(r.gamesBuilt ?? 0),
          me: !!user && user.uid === r.userId,
        })),
      });
    }

    const slug = (q.get("slug") ?? "").trim();
    if (!SLUG_RE.test(slug)) return json(400, { code: "BAD_SLUG" });
    const games = await db
      .select({ id: smithGames.id, title: smithGames.title, visibility: smithGames.visibility, userId: smithGames.userId, plays: smithGames.plays, likes: smithGames.likes })
      .from(smithGames)
      .where(eq(smithGames.slug, slug))
      .limit(1);
    const game = games[0];
    if (!game) return json(404, { code: "NO_GAME" });
    if (game.visibility === "private" && (!user || user.uid !== game.userId))
      return json(403, { code: "PRIVATE" });

    const board = await leaderboard(game.id, 20);
    const mine = user
      ? await db
          .select({ best: sql<number>`coalesce(max(${smithScores.score}), 0)::int`, runs: sql<number>`count(*)::int` })
          .from(smithScores)
          .where(and(eq(smithScores.gameId, game.id), eq(smithScores.userId, user.uid)))
          .catch(() => [])
      : [];
    return json(200, {
      game: {
        slug,
        title: game.title,
        visibility: game.visibility,
        plays: Number(game.plays ?? 0),
        likes: Number(game.likes ?? 0),
        mine: !!user && user.uid === game.userId,
      },
      board,
      me: mine[0] ? { best: Number(mine[0].best ?? 0), runs: Number(mine[0].runs ?? 0) } : null,
    });
  } catch (e) {
    return serverError("smith:score:get", e, "DB");
  }
}
