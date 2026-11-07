import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { idSchema, offerUpdateSchema } from "@/lib/validation/schemas";
import { transitionOffer } from "@/features/offers/service";
import { AppError } from "@/lib/server/errors";
export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) { return api(request, { auth: true, mutation: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { id } = idSchema.parse(await context.params); return ok(await transitionOffer(actor, id, await readJson(request, offerUpdateSchema))); }); }
