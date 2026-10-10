import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { db } from "@/db";
import { conversations, toolRuns } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const [convs, runs] = await Promise.all([
      db
        .select({
          id: conversations.id,
          title: conversations.title,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(eq(conversations.userId, user.uid))
        .orderBy(desc(conversations.updatedAt))
        .limit(40),
      db
        .select({
          id: toolRuns.id,
          tool: toolRuns.tool,
          title: toolRuns.title,
          output: toolRuns.output,
          createdAt: toolRuns.createdAt,
        })
        .from(toolRuns)
        .where(eq(toolRuns.userId, user.uid))
        .orderBy(desc(toolRuns.createdAt))
        .limit(40),
    ]);
    return json(200, { conversations: convs, runs });
  } catch (e) {
    return serverError("history", e, "DB");
  }
}
