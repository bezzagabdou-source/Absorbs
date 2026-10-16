import { NextRequest } from "next/server";
import { repo } from "@/lib/repo";
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

/** GET → conversation + its messages (owner only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const o = await owned(req, ctx);
  if ("res" in o) return o.res;
  try {
    const conv = await repo.getConversation(o.user.uid, o.id);
    if (!conv) return json(404, { code: "NOT_FOUND" });
    const msgs = await repo.listMessages(o.id);
    return json(200, { conversation: conv, messages: msgs });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}

/** PATCH { title } → rename (owner only). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const o = await owned(req, ctx);
  if ("res" in o) return o.res;
  const body = (await req.json().catch(() => ({}))) as { title?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  if (!title) return json(400, { code: "TITLE_REQUIRED" });
  try {
    const row = await repo.renameConversation(o.user.uid, o.id, title);
    if (!row) return json(404, { code: "NOT_FOUND" });
    return json(200, { conversation: row });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}

/** DELETE → remove one conversation and its messages (owner only). */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const o = await owned(req, ctx);
  if ("res" in o) return o.res;
  try {
    await repo.deleteConversation(o.user.uid, o.id);
    return json(200, { ok: true });
  } catch (e) {
    return serverError("conversation", e, "DB");
  }
}
