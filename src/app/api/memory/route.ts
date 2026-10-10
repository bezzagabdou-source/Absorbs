import { json, serverError, isUuid } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { aiMemories } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

const MAX_ITEMS = 60;
const MAX_LEN = 400;

/** GET → the user's long-term memory list (newest first). */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureUser(user);
    const rows = await db
      .select({ id: aiMemories.id, content: aiMemories.content, source: aiMemories.source, createdAt: aiMemories.createdAt })
      .from(aiMemories)
      .where(eq(aiMemories.userId, user.uid))
      .orderBy(desc(aiMemories.createdAt))
      .limit(MAX_ITEMS);
    return json(200, { memories: rows });
  } catch (e) {
    return serverError("memory:get", e, "DB");
  }
}

/** POST { content } → add one memory fact. */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`mem:${user.uid}`, 30, 60_000).ok) return json(429, { code: "RATE" });
  let body: { content?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const content = typeof body.content === "string" ? body.content.replace(/\s+/g, " ").trim().slice(0, MAX_LEN) : "";
  if (content.length < 3) return json(400, { code: "BAD_CONTENT" });
  try {
    await ensureUser(user);
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(aiMemories)
      .where(eq(aiMemories.userId, user.uid));
    if ((count[0]?.n ?? 0) >= MAX_ITEMS) return json(409, { code: "FULL" });
    const row = await db
      .insert(aiMemories)
      .values({ userId: user.uid, content, source: "user" })
      .returning({ id: aiMemories.id, content: aiMemories.content, source: aiMemories.source, createdAt: aiMemories.createdAt });
    return json(200, { memory: row[0] });
  } catch (e) {
    return serverError("memory:post", e, "DB");
  }
}

/** DELETE ?id=<uuid> (or ?all=1) */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  try {
    if (url.searchParams.get("all") === "1") {
      await db.delete(aiMemories).where(eq(aiMemories.userId, user.uid));
      return json(200, { ok: true });
    }
    if (!isUuid(id)) return json(400, { code: "BAD_ID" });
    await db.delete(aiMemories).where(and(eq(aiMemories.id, id), eq(aiMemories.userId, user.uid)));
    return json(200, { ok: true });
  } catch (e) {
    return serverError("memory:delete", e, "DB");
  }
}
