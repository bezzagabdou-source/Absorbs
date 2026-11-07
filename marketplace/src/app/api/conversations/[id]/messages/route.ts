import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { getMessages, sendMessage } from "@/features/chat/service";
import { AppError } from "@/lib/server/errors";
import { idSchema, messageInputSchema } from "@/lib/validation/schemas";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return api(request, { auth: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { id } = idSchema.parse(await context.params); return ok(await getMessages(actor, id)); }); }
export async function POST(request: NextRequest, context: Context) { return api(request, { auth: true, mutation: true, limit: 30 }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { id } = idSchema.parse(await context.params); const { body } = await readJson(request, messageInputSchema); return ok(await sendMessage(actor, id, body), 201); }); }
