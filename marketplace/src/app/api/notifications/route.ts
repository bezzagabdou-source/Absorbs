import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { getNotifications, markNotifications } from "@/features/notifications/queries";
import { notificationUpdateSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/server/errors";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, { auth: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); return ok({ items: await getNotifications(actor) }); }); }
export async function PATCH(request: NextRequest) { return api(request, { auth: true, mutation: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const input = await readJson(request, notificationUpdateSchema); return ok(await markNotifications(actor, input.all ? undefined : input.ids)); }); }
