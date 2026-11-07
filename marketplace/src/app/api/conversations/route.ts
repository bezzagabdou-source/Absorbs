import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { getConversations, startConversation } from "@/features/chat/service";
import { AppError } from "@/lib/server/errors";
import { z } from "zod";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, { auth: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); return ok({ items: await getConversations(actor) }); }); }
export async function POST(request: NextRequest) { return api(request, { auth: true, mutation: true, limit: 10 }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { productId } = await readJson(request, z.object({ productId: z.uuid() }).strict()); return ok(await startConversation(actor, productId), 201); }); }
