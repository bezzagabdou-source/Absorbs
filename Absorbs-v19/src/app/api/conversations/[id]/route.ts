import { isUuid, json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const { id } = await ctx.params;
  if (!isUuid(id)) return json(404, { code: "NOT_FOUND" });
  try {
    const conv = (
      await db
        .select()
        .from(conversations)
        .where(and(eq(conversations.id, id), eq(conversations.userId, user.uid)))
        .limit(1)
    )[0];
    if (!conv) return json(404, { code: "NOT_FOUND" });
    const msgs = await db
      .select({
        id: messages.id,
        role: messages.role,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt))
      .limit(200);
    return json(200, { conversation: conv, messages: msgs });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const { id } = await ctx.params;
  if (!isUuid(id)) return json(404, { code: "NOT_FOUND" });
  try {
    await db
      .delete(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, user.uid)))
      .execute();
    return json(200, { ok: true });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}
