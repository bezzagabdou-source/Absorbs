import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { gameSaves } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export const runtime = "nodejs";

const MAX_BYTES = 200_000; // a save is state, not assets
const KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;

function keys(game: unknown, slot: unknown): { game: string; slot: string } | null {
  const g = typeof game === "string" ? game.trim() : "";
  const s = typeof slot === "string" && slot.trim() ? slot.trim() : "auto";
  return KEY_RE.test(g) && KEY_RE.test(s) ? { game: g, slot: s } : null;
}

/** GET ?game=&slot= → one save · GET ?game= → every slot of that game. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const q = new URL(req.url).searchParams;
  const k = keys(q.get("game"), q.get("slot"));
  if (!k) return json(400, { code: "BAD_KEY" });
  try {
    await ensureUser(user);
    const rows = await db
      .select({ slot: gameSaves.slot, data: gameSaves.data, updatedAt: gameSaves.updatedAt })
      .from(gameSaves)
      .where(
        q.get("slot")
          ? and(eq(gameSaves.userId, user.uid), eq(gameSaves.game, k.game), eq(gameSaves.slot, k.slot))
          : and(eq(gameSaves.userId, user.uid), eq(gameSaves.game, k.game))
      )
      .limit(12);
    if (q.get("slot")) return rows[0] ? json(200, { save: rows[0] }) : json(404, { code: "NOT_FOUND" });
    return json(200, { saves: rows });
  } catch (e) {
    return serverError("saves:get", e, "DB");
  }
}

/** POST { game, slot?, data } → create or overwrite the save. */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`save:${user.uid}`, 60, 60_000).ok) return json(429, { code: "RATE" });
  let body: { game?: unknown; slot?: unknown; data?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const k = keys(body.game, body.slot);
  if (!k) return json(400, { code: "BAD_KEY" });
  if (body.data === undefined || body.data === null || typeof body.data !== "object") return json(400, { code: "BAD_DATA" });
  if (JSON.stringify(body.data).length > MAX_BYTES) return json(413, { code: "TOO_BIG" });
  try {
    await ensureUser(user);
    await db
      .insert(gameSaves)
      .values({ userId: user.uid, game: k.game, slot: k.slot, data: body.data })
      .onConflictDoUpdate({
        target: [gameSaves.userId, gameSaves.game, gameSaves.slot],
        set: { data: body.data, updatedAt: new Date() },
      });
    return json(200, { ok: true });
  } catch (e) {
    return serverError("saves:post", e, "DB");
  }
}

/** DELETE ?game=&slot= */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const q = new URL(req.url).searchParams;
  const k = keys(q.get("game"), q.get("slot"));
  if (!k) return json(400, { code: "BAD_KEY" });
  try {
    await db.delete(gameSaves).where(and(eq(gameSaves.userId, user.uid), eq(gameSaves.game, k.game), eq(gameSaves.slot, k.slot)));
    return json(200, { ok: true });
  } catch (e) {
    return serverError("saves:delete", e, "DB");
  }
}
