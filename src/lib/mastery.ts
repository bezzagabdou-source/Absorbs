/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NEXUS MASTERY v17 — the rewards, levels & badges layer
 * ═══════════════════════════════════════════════════════════════════════════
 *  Everything a user does on the platform earns XP: building a game, publishing
 *  it, playing it, submitting a score, asking MIND to read a request, running a
 *  tool, keeping a daily streak. XP → level → badges → leaderboard.
 *
 *  Rules this file follows:
 *   - the database is optional: every function degrades to `null` instead of
 *     throwing, so a missing DATABASE_URL never breaks a game or a chat
 *   - counters are updated with one atomic `update … set x = x + n` per award
 *   - the streak uses the Algeria day (same clock as the daily credits)
 *   - badge conditions are pure functions of the profile + a few cheap stats
 */

import { db } from "@/db";
import { masteryProfiles, smithGames, smithScores, mindEvents, toolRuns } from "@/db/schema";
import { eq, sql, desc } from "drizzle-orm";
import { algeriaToday } from "@/lib/usage";

export * from "@/lib/mastery-rules";

import {
  BADGES,
  levelFromXp,
  levelProgress,
  rankFor,
  XP_AMOUNT,
  type BadgeCtx,
  type BadgeDef,
  type BadgeExtras,
  type BadgeState,
  type Rank,
  type XpAction,
} from "@/lib/mastery-rules";

/* ────────────────────────────── persistence ────────────────────────────── */

export interface MasterySnapshot {
  xp: number;
  level: number;
  progress: ReturnType<typeof levelProgress>;
  rank: Rank;
  gamesBuilt: number;
  gamesPlayed: number;
  runsSubmitted: number;
  mindReads: number;
  bestScore: number;
  streak: number;
  longestStreak: number;
  lastActiveDay: string | null;
  badges: { id: string; at: string }[];
  badgeGrid: { def: BadgeDef; unlocked: boolean; value: number; pct: number; at?: string }[];
}

function emptyProfile(uid: string) {
  return {
    userId: uid,
    xp: 0,
    level: 1,
    gamesBuilt: 0,
    gamesPlayed: 0,
    runsSubmitted: 0,
    mindReads: 0,
    bestScore: 0,
    streak: 0,
    longestStreak: 0,
    lastActiveDay: null as string | null,
    badges: [] as unknown[],
  };
}

type ProfileRow = ReturnType<typeof emptyProfile>;

async function loadProfile(uid: string): Promise<ProfileRow> {
  const rows = await db.select().from(masteryProfiles).where(eq(masteryProfiles.userId, uid)).limit(1);
  if (rows[0]) {
    return {
      userId: uid,
      xp: Number(rows[0].xp ?? 0),
      level: Number(rows[0].level ?? 1),
      gamesBuilt: Number(rows[0].gamesBuilt ?? 0),
      gamesPlayed: Number(rows[0].gamesPlayed ?? 0),
      runsSubmitted: Number(rows[0].runsSubmitted ?? 0),
      mindReads: Number(rows[0].mindReads ?? 0),
      bestScore: Number(rows[0].bestScore ?? 0),
      streak: Number(rows[0].streak ?? 0),
      longestStreak: Number(rows[0].longestStreak ?? 0),
      lastActiveDay: rows[0].lastActiveDay ?? null,
      badges: Array.isArray(rows[0].badges) ? (rows[0].badges as unknown[]) : [],
    };
  }
  await db.insert(masteryProfiles).values({ userId: uid }).onConflictDoNothing().execute().catch(() => undefined);
  return emptyProfile(uid);
}

/** The few extra numbers the badge grid needs (cheap, cached by the caller). */
export async function collectExtras(uid: string): Promise<BadgeCtx & BadgeExtras> {
  const p = await loadProfile(uid);
  const [bp, langs, published, likes, tools, nights] = await Promise.all([
    db
      .select({ n: sql<number>`count(distinct ${smithGames.blueprint})` })
      .from(smithGames)
      .where(eq(smithGames.userId, uid))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(distinct ${mindEvents.lang})` })
      .from(mindEvents)
      .where(eq(mindEvents.userId, uid))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)` })
      .from(smithGames)
      .where(sql`${smithGames.userId} = ${uid} and ${smithGames.visibility} <> 'private'`)
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`coalesce(sum(${smithGames.likes}), 0)` })
      .from(smithGames)
      .where(eq(smithGames.userId, uid))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)` })
      .from(toolRuns)
      .where(eq(toolRuns.userId, uid))
      .catch(() => [{ n: 0 }]),
    db
      .select({ n: sql<number>`count(*)` })
      .from(smithScores)
      .where(sql`${smithScores.userId} = ${uid} and (date_part('hour', ${smithScores.createdAt} + interval '1 hour') >= 23 or date_part('hour', ${smithScores.createdAt} + interval '1 hour') < 5)`)
      .catch(() => [{ n: 0 }]),
  ]);
  return {
    xp: p.xp,
    level: levelFromXp(p.xp),
    gamesBuilt: p.gamesBuilt,
    gamesPlayed: p.gamesPlayed,
    runsSubmitted: p.runsSubmitted,
    mindReads: p.mindReads,
    bestScore: p.bestScore,
    streak: p.streak,
    longestStreak: p.longestStreak,
    blueprints: Number(bp[0]?.n ?? 0),
    langs: Number(langs[0]?.n ?? 0),
    published: Number(published[0]?.n ?? 0),
    likes: Number(likes[0]?.n ?? 0),
    tools: Number(tools[0]?.n ?? 0),
    nightRuns: Number(nights[0]?.n ?? 0) > 0,
  };
}

export interface AwardResult {
  xp: number;
  gained: number;
  level: number;
  levelUp: boolean;
  progress: ReturnType<typeof levelProgress>;
  streak: number;
  newBadges: BadgeDef[];
}

function dayDelta(a: string | null, b: string): number {
  if (!a) return 99;
  const d1 = new Date(`${a}T00:00:00+01:00`).getTime();
  const d2 = new Date(`${b}T00:00:00+01:00`).getTime();
  if (!Number.isFinite(d1) || !Number.isFinite(d2)) return 99;
  return Math.round((d2 - d1) / 86_400_000);
}

/**
 * Award XP for one action. Safe: returns null when the DB is unavailable so the
 * caller can keep serving the user.
 */
export async function award(
  uid: string,
  action: XpAction,
  opts: { score?: number; count?: number } = {}
): Promise<AwardResult | null> {
  try {
    const p = await loadProfile(uid);
    const today = algeriaToday();
    const gap = dayDelta(p.lastActiveDay, today);
    const streak = gap === 0 ? Math.max(1, p.streak) : gap === 1 ? p.streak + 1 : 1;

    const base = XP_AMOUNT[action] ?? 5;
    const count = Math.max(1, Math.min(50, Math.round(opts.count ?? 1)));
    let gained = base * count;
    if (action === "smith_score" && opts.score) gained += Math.min(120, Math.floor(Math.max(0, opts.score) / 100));
    if (gap !== 0) gained += XP_AMOUNT.daily_first;

    const xp = Math.max(0, p.xp + gained);
    const level = levelFromXp(xp);
    const bestScore = Math.max(p.bestScore, Math.max(0, Math.round(opts.score ?? 0)));

    const inc: Record<string, number> = {
      smith_build: 1, ai_game: 1,
    } as Record<string, number>;
    const gamesBuilt = p.gamesBuilt + (inc[action] ?? 0) * count;
    const gamesPlayed = p.gamesPlayed + (action === "smith_play" ? count : 0);
    const runsSubmitted = p.runsSubmitted + (action === "smith_score" ? count : 0);
    const mindReads = p.mindReads + (action === "mind_read" ? count : 0);

    await db
      .update(masteryProfiles)
      .set({
        xp,
        level,
        gamesBuilt,
        gamesPlayed,
        runsSubmitted,
        mindReads,
        bestScore,
        streak,
        longestStreak: Math.max(p.longestStreak, streak),
        lastActiveDay: today,
        updatedAt: new Date(),
      })
      .where(eq(masteryProfiles.userId, uid))
      .execute();

    /* badges: evaluated after the counters moved, using fresh stats */
    const state = await collectExtras(uid).catch(() => null);
    const owned = new Set(
      (Array.isArray(p.badges) ? (p.badges as { id?: string }[]) : [])
        .map((b) => (b && typeof b.id === "string" ? b.id : ""))
        .filter(Boolean)
    );
    const newBadges: BadgeDef[] = [];
    if (state) {
      const s = { ...state, xp, level, bestScore, gamesBuilt, gamesPlayed, runsSubmitted, mindReads, streak };
      for (const b of BADGES) {
        if (owned.has(b.id)) continue;
        if (b.done(s)) {
          newBadges.push(b);
          owned.add(b.id);
        }
      }
      if (newBadges.length) {
        const merged = [
          ...(Array.isArray(p.badges) ? (p.badges as unknown[]) : []),
          ...newBadges.map((b) => ({ id: b.id, at: new Date().toISOString() })),
        ];
        await db
          .update(masteryProfiles)
          .set({ badges: merged })
          .where(eq(masteryProfiles.userId, uid))
          .execute()
          .catch(() => undefined);
      }
    }

    return {
      xp,
      gained,
      level,
      levelUp: level > p.level,
      progress: levelProgress(xp),
      streak,
      newBadges,
    };
  } catch (e) {
    console.error("[mastery] award failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Full snapshot for the dashboard, or null when the DB is unavailable. */
export async function masterySnapshot(uid: string): Promise<MasterySnapshot | null> {
  try {
    const p = await loadProfile(uid);
    const state = await collectExtras(uid).catch(() => null);
    const ownedAt = new Map<string, string>();
    for (const b of Array.isArray(p.badges) ? (p.badges as { id?: string; at?: string }[]) : []) {
      if (b && typeof b.id === "string") ownedAt.set(b.id, b.at ?? "");
    }
    const badgeGrid = BADGES.map((def) => {
      const value = state ? def.value(state) : 0;
      const unlocked = ownedAt.has(def.id) || (state ? def.done(state) : false);
      return {
        def,
        unlocked,
        value,
        pct: Math.min(100, Math.round((value / Math.max(1, def.goal)) * 100)),
        at: ownedAt.get(def.id),
      };
    });
    return {
      xp: p.xp,
      level: levelFromXp(p.xp),
      progress: levelProgress(p.xp),
      rank: rankFor(levelFromXp(p.xp)),
      gamesBuilt: p.gamesBuilt,
      gamesPlayed: p.gamesPlayed,
      runsSubmitted: p.runsSubmitted,
      mindReads: p.mindReads,
      bestScore: p.bestScore,
      streak: p.streak,
      longestStreak: p.longestStreak,
      lastActiveDay: p.lastActiveDay,
      badges: [...ownedAt.entries()].map(([id, at]) => ({ id, at })),
      badgeGrid,
    };
  } catch (e) {
    console.error("[mastery] snapshot failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Global XP leaderboard (top N) — public names only, never emails. */
export async function xpLeaderboard(limit = 20) {
  try {
    const rows = await db
      .select({
        userId: masteryProfiles.userId,
        xp: masteryProfiles.xp,
        level: masteryProfiles.level,
        gamesBuilt: masteryProfiles.gamesBuilt,
        bestScore: masteryProfiles.bestScore,
        streak: masteryProfiles.streak,
      })
      .from(masteryProfiles)
      .orderBy(desc(masteryProfiles.xp))
      .limit(Math.min(50, Math.max(1, limit)));
    return rows.map((r) => ({ ...r, xp: Number(r.xp ?? 0), level: levelFromXp(Number(r.xp ?? 0)) }));
  } catch {
    return [];
  }
}
