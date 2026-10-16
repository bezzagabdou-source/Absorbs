import { NextRequest } from "next/server";
import { repo } from "@/lib/repo";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { json, serverError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → the caller's conversations (newest first, max 100). */
export async function GET(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    await ensureUser(user);
    const rows = await repo.listConversations(user.uid);
    return json(200, { conversations: rows });
  } catch (e) {
    return serverError("conversations", e, "DB");
  }
}

/** POST { title?, model? } → create a conversation. */
export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const body = (await req.json().catch(() => ({}))) as { title?: unknown; model?: unknown };
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "محادثة جديدة";
  const model = typeof body.model === "string" ? body.model.slice(0, 40) : "nexus-core";
  try {
    await ensureUser(user);
    const row = await repo.createConversation(user.uid, title, model);
    return json(201, { conversation: row });
  } catch (e) {
    return serverError("conversations", e, "DB");
  }
}

/** DELETE → wipe ALL of the caller's conversations (settings → clear history). */
export async function DELETE(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const n = await repo.deleteAllConversations(user.uid);
    return json(200, { ok: true, deleted: n });
  } catch (e) {
    return serverError("conversations-delete", e, "DB");
  }
}
