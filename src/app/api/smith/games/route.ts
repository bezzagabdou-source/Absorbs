import { json, serverError, isUuid } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { award } from "@/lib/mastery";
import { db } from "@/db";
import { smithGames } from "@/db/schema";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

export const runtime = "nodejs";
export const maxDuration = 60;

const VISIBILITY = new Set(["private", "unlisted", "public"]);

const META = {
  id: smithGames.id,
  slug: smithGames.slug,
  title: smithGames.title,
  blueprint: smithGames.blueprint,
  theme: smithGames.theme,
  engine: smithGames.engine,
  visibility: smithGames.visibility,
  plays: smithGames.plays,
  likes: smithGames.likes,
  bestScore: smithGames.bestScore,
  bytes: smithGames.bytes,
  createdAt: smithGames.createdAt,
  updatedAt: smithGames.updatedAt,
};

/**
 * GET             → the vault (metadata only, newest first)
 * GET ?id=        → one game WITH its html (and its best score from the board)
 * GET ?slugs=a,b  → metadata for a list of shared games (used by the arena)
 */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const q = new URL(req.url).searchParams;
  try {
    await ensureUser(user);

    const id = q.get("id");
    if (id) {
      if (!isUuid(id)) return json(400, { code: "BAD_ID" });
      const rows = await db
        .select()
        .from(smithGames)
        .where(and(eq(smithGames.id, id), eq(smithGames.userId, user.uid)))
        .limit(1);
      const g = rows[0];
      if (!g) return json(404, { code: "NOT_FOUND" });
      return json(200, { game: { ...g, config: g.config ?? {} } });
    }

    const slugs = (q.get("slugs") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 24);
    if (slugs.length) {
      const rows = await db
        .select(META)
        .from(smithGames)
        .where(and(inArray(smithGames.slug, slugs), sql`${smithGames.visibility} <> 'private'`));
      return json(200, { games: rows });
    }

    const rows = await db
      .select(META)
      .from(smithGames)
      .where(eq(smithGames.userId, user.uid))
      .orderBy(desc(smithGames.updatedAt))
      .limit(120);
    return json(200, { games: rows });
  } catch (e) {
    return serverError("smith:games:get", e, "DB");
  }
}

/** PATCH { id, title?, visibility? } → rename / publish / unpublish. */
export async function PATCH(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`smithp:${user.uid}`, 40, 60_000).ok) return json(429, { code: "RATE" });

  let body: { id?: unknown; title?: unknown; visibility?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!isUuid(id)) return json(400, { code: "BAD_ID" });

  const patch: { title?: string; visibility?: string; updatedAt?: Date } = { updatedAt: new Date() };
  if (typeof body.title === "string" && body.title.trim())
    patch.title = body.title.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  const publishing =
    typeof body.visibility === "string" && VISIBILITY.has(body.visibility) && body.visibility !== "private";
  if (typeof body.visibility === "string" && VISIBILITY.has(body.visibility))
    patch.visibility = body.visibility;
  else return json(400, { code: "BAD_VISIBILITY" });

  try {
    await ensureUser(user);
    const rows = await db
      .update(smithGames)
      .set(patch)
      .where(and(eq(smithGames.id, id), eq(smithGames.userId, user.uid)))
      .returning(META)
      .catch(() => []);
    if (!rows.length) return json(404, { code: "NOT_FOUND" });
    const xp = publishing ? await award(user.uid, "smith_publish").catch(() => null) : null;
    return json(200, { game: rows[0], xp });
  } catch (e) {
    return serverError("smith:games:patch", e, "DB");
  }
}

/** DELETE ?id= → remove one game (and its scores, via ON DELETE CASCADE). */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`smithd:${user.uid}`, 30, 60_000).ok) return json(429, { code: "RATE" });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return json(400, { code: "BAD_ID" });
  try {
    await ensureUser(user);
    const rows = await db
      .delete(smithGames)
      .where(and(eq(smithGames.id, id), eq(smithGames.userId, user.uid)))
      .returning({ id: smithGames.id })
      .catch(() => []);
    if (!rows.length) return json(404, { code: "NOT_FOUND" });
    return json(200, { ok: true, id });
  } catch (e) {
    return serverError("smith:games:delete", e, "DB");
  }
}
