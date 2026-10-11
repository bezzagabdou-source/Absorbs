import { json, serverError } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { masterySnapshot, xpLeaderboard } from "@/lib/mastery";
import { db } from "@/db";
import {
  conversations,
  smithGames,
  smithScores,
  messages,
  mindEvents,
  projects,
  toolRuns,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/mastery/stats → everything the Titan dashboard renders, in ONE call.
 *
 * Every query is independent and best-effort: if the database is partially
 * unavailable the dashboard still renders with the sections it does have
 * (`offline: [...]` tells the UI which ones to grey out).
 */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`mastery:${user.uid}`, 60, 60_000).ok) return json(429, { code: "RATE" });

  const offline: string[] = [];
  const since = new Date(Date.now() - 30 * 86_400_000);

  try {
    await ensureUser(user);
  } catch {
    offline.push("user");
  }

  const [snapshot, board, mine, intentRows, langRows, hourRows, counts, recentRuns, myBest] =
    await Promise.all([
      masterySnapshot(user.uid).catch(() => {
        offline.push("mastery");
        return null;
      }),
      xpLeaderboard(12).catch(() => {
        offline.push("board");
        return [];
      }),
      db
        .select({
          id: smithGames.id,
          slug: smithGames.slug,
          title: smithGames.title,
          blueprint: smithGames.blueprint,
          theme: smithGames.theme,
          visibility: smithGames.visibility,
          plays: smithGames.plays,
          likes: smithGames.likes,
          bestScore: smithGames.bestScore,
          createdAt: smithGames.createdAt,
        })
        .from(smithGames)
        .where(eq(smithGames.userId, user.uid))
        .orderBy(desc(smithGames.createdAt))
        .limit(40)
        .catch(() => {
          offline.push("games");
          return [];
        }),
      db
        .select({ intent: mindEvents.intent, n: sql<number>`count(*)::int` })
        .from(mindEvents)
        .where(and(eq(mindEvents.userId, user.uid), gte(mindEvents.createdAt, since)))
        .groupBy(mindEvents.intent)
        .orderBy(desc(sql`count(*)`))
        .limit(8)
        .catch(() => {
          offline.push("intents");
          return [];
        }),
      db
        .select({ lang: mindEvents.lang, n: sql<number>`count(*)::int` })
        .from(mindEvents)
        .where(and(eq(mindEvents.userId, user.uid), gte(mindEvents.createdAt, since)))
        .groupBy(mindEvents.lang)
        .orderBy(desc(sql`count(*)`))
        .limit(6)
        .catch(() => {
          offline.push("langs");
          return [];
        }),
      db
        .select({ h: sql<number>`date_part('hour', ${mindEvents.createdAt})::int`, n: sql<number>`count(*)::int` })
        .from(mindEvents)
        .where(and(eq(mindEvents.userId, user.uid), gte(mindEvents.createdAt, since)))
        .groupBy(sql`date_part('hour', ${mindEvents.createdAt})`)
        .orderBy(sql`date_part('hour', ${mindEvents.createdAt})`)
        .catch(() => {
          offline.push("hours");
          return [];
        }),
      Promise.all([
        db.select({ n: sql<number>`count(*)::int` }).from(conversations).where(eq(conversations.userId, user.uid)).catch(() => [{ n: 0 }]),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(messages)
          .innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .where(and(eq(conversations.userId, user.uid), eq(messages.role, "assistant")))
          .catch(() => [{ n: 0 }]),
        db.select({ n: sql<number>`count(*)::int` }).from(toolRuns).where(eq(toolRuns.userId, user.uid)).catch(() => [{ n: 0 }]),
        db.select({ n: sql<number>`count(*)::int` }).from(projects).where(eq(projects.userId, user.uid)).catch(() => [{ n: 0 }]),
        db.select({ n: sql<number>`count(*)::int` }).from(mindEvents).where(eq(mindEvents.userId, user.uid)).catch(() => [{ n: 0 }]),
      ]).catch(() => {
        offline.push("counts");
        return [[{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }], [{ n: 0 }]];
      }),
      db
        .select({ tool: toolRuns.tool, n: sql<number>`count(*)::int` })
        .from(toolRuns)
        .where(and(eq(toolRuns.userId, user.uid), gte(toolRuns.createdAt, since)))
        .groupBy(toolRuns.tool)
        .orderBy(desc(sql`count(*)`))
        .limit(8)
        .catch(() => {
          offline.push("tools");
          return [];
        }),
      db
        .select({
          score: smithScores.score,
          level: smithScores.level,
          at: smithScores.createdAt,
          title: smithGames.title,
          slug: smithGames.slug,
        })
        .from(smithScores)
        .innerJoin(smithGames, eq(smithGames.id, smithScores.gameId))
        .where(eq(smithScores.userId, user.uid))
        .orderBy(desc(smithScores.score))
        .limit(5)
        .catch(() => {
          offline.push("scores");
          return [];
        }),
    ]);

  const games = mine.map((g) => ({
    ...g,
    plays: Number(g.plays ?? 0),
    likes: Number(g.likes ?? 0),
    bestScore: Number(g.bestScore ?? 0),
    createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt ?? ""),
  }));

  const totalPlays = games.reduce((a, g) => a + g.plays, 0);
  const totalLikes = games.reduce((a, g) => a + g.likes, 0);
  const published = games.filter((g) => g.visibility !== "private").length;

  return json(200, {
    user: {
      name: user.name || user.email?.split("@")[0] || "لاعب",
      email: user.email ?? "",
      picture: user.picture ?? null,
    },
    mastery: snapshot,
    leaderboard: board.map((r) => ({
      level: r.level,
      xp: r.xp,
      gamesBuilt: Number(r.gamesBuilt ?? 0),
      bestScore: Number(r.bestScore ?? 0),
      streak: Number(r.streak ?? 0),
      me: r.userId === user.uid,
      name: r.userId === user.uid ? (user.name || user.email?.split("@")[0] || "أنت") : "لاعب",
    })),
    smith: {
      games,
      built: games.length,
      published,
      totalPlays,
      totalLikes,
      topByPlays: [...games].sort((a, b) => b.plays - a.plays).slice(0, 5),
    },
    insights: {
      intents: intentRows.map((r) => ({ intent: r.intent, n: Number(r.n ?? 0) })),
      languages: langRows.map((r) => ({ lang: r.lang, n: Number(r.n ?? 0) })),
      hours: hourRows.map((r) => ({ h: Number(r.h ?? 0), n: Number(r.n ?? 0) })),
      tools: recentRuns.map((r) => ({ tool: r.tool, n: Number(r.n ?? 0) })),
      bestRuns: myBest.map((r) => ({
        score: Number(r.score ?? 0),
        level: Number(r.level ?? 1),
        title: r.title,
        slug: r.slug,
        at: r.at instanceof Date ? r.at.toISOString() : String(r.at ?? ""),
      })),
    },
    counts: {
      conversations: Number(counts[0]?.[0]?.n ?? 0),
      myAnswers: Number(counts[1]?.[0]?.n ?? 0),
      toolRuns: Number(counts[2]?.[0]?.n ?? 0),
      projects: Number(counts[3]?.[0]?.n ?? 0),
      mindReads: Number(counts[4]?.[0]?.n ?? 0),
    },
    offline: [...new Set(offline)],
  });
}
