import { NextRequest } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { verifyRequest } from "@/lib/server-auth";
import { isUuid, json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Resolves the caller and the conversation they own (never another user's). */
async function owned(req: NextRequest, ctx: Ctx) {
  const user = await verifyRequest(req);
  if (!user) return { res: json(401, { code: "UNAUTHENTICATED" }) } as const;
  const { id } = await ctx.params;
  if (!isUuid(id)) return { res: json(404, { code: "NOT_FOUND" }) } as const;
  return { user, id } as const;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const o = await owned(req, ctx);
  if ("res" in o) return o.res;
  try {
    const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, o.id), eq(conversations.userId, o.user.uid))).limit(1);
    if (!conv) return json(404, { code: "NOT_FOUND" });
    const msgs = await db.select().from(messages).where(eq(messages.conversationId, o.id)).orderBy(asc(messages.createdAt));
    return json(200, { conversation: conv, messages: msgs });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const o = await owned(req, ctx);
  if ("res" in o) return o.res;
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return json(400, { code: "TITLE_REQUIRED" });
  try {
    const [row] = await db.update(conversations).set({ title }).where(and(eq(conversations.id, o.id), eq(conversations.userId, o.user.uid))).returning();
    if (!row) return json(404, { code: "NOT_FOUND" });
    return json(200, { conversation: row });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const o = await owned(req, ctx);
  if ("res" in o) return o.res;
  try {
    await db.delete(conversations).where(and(eq(conversations.id, o.id), eq(conversations.userId, o.user.uid)));
    return json(200, { ok: true });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}
