import { json, serverError, isUuid } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

export const runtime = "nodejs";

const MAX_PROJECTS = 40;
const MAX_HTML = 900_000; // chars — well under the 4.5 MB body limit

/** GET → saved creations (newest first). `?id=` returns one with its full html. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const id = new URL(req.url).searchParams.get("id");
  try {
    await ensureUser(user);
    if (id) {
      if (!isUuid(id)) return json(400, { code: "BAD_ID" });
      const one = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.userId, user.uid)))
        .limit(1);
      return one[0] ? json(200, { project: one[0] }) : json(404, { code: "NOT_FOUND" });
    }
    const rows = await db
      .select({ id: projects.id, title: projects.title, html: projects.html, updatedAt: projects.updatedAt })
      .from(projects)
      .where(eq(projects.userId, user.uid))
      .orderBy(desc(projects.updatedAt))
      .limit(MAX_PROJECTS);
    return json(200, { projects: rows });
  } catch (e) {
    return serverError("projects:get", e, "DB");
  }
}

/** POST { title, html } → save a creation. */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  if (!rateLimit(`proj:${user.uid}`, 20, 60_000).ok) return json(429, { code: "RATE" });
  let body: { title?: unknown; html?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const html = typeof body.html === "string" ? body.html : "";
  if (html.length < 20 || html.length > MAX_HTML) return json(400, { code: "BAD_HTML" });
  const title =
    (typeof body.title === "string" ? body.title : "").replace(/\s+/g, " ").trim().slice(0, 80) ||
    (html.match(/<title>([^<]{1,60})<\/title>/i)?.[1] ?? "عمل بدون عنوان").trim();
  try {
    await ensureUser(user);
    const count = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(projects)
      .where(eq(projects.userId, user.uid));
    if ((count[0]?.n ?? 0) >= MAX_PROJECTS) return json(409, { code: "FULL" });
    const row = await db
      .insert(projects)
      .values({ userId: user.uid, title, html })
      .returning({ id: projects.id, title: projects.title, updatedAt: projects.updatedAt });
    return json(200, { project: row[0] });
  } catch (e) {
    return serverError("projects:post", e, "DB");
  }
}

/** DELETE ?id=<uuid> */
export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!isUuid(id)) return json(400, { code: "BAD_ID" });
  try {
    await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, user.uid)));
    return json(200, { ok: true });
  } catch (e) {
    return serverError("projects:delete", e, "DB");
  }
}
