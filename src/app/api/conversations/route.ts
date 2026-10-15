import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";
import { conversations } from "@/db/schema";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureSchema();
    await ensureUser(user);
    const rows = await db.select().from(conversations).where(eq(conversations.userId, user.uid)).orderBy(desc(conversations.updatedAt)).limit(100);
    return json(200, { conversations: rows });
  } catch (e) {
    return serverError("conversations", e, "DB");
  }
}

export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "محادثة جديدة";
  const model = typeof body.model === "string" ? body.model.slice(0, 40) : "nexus-core";
  try {
    await ensureSchema();
    await ensureUser(user);
    const [row] = await db.insert(conversations).values({ userId: user.uid, title, model }).returning();
    return json(201, { conversation: row });
  } catch (e) {
    return serverError("conversations", e, "DB");
  }
}
