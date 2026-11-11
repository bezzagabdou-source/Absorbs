import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { offerInputSchema } from "@/lib/validation/schemas";
import { createOffer, listOffers } from "@/features/offers/service";
import { AppError } from "@/lib/server/errors";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, { auth: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); return ok(await listOffers(actor)); }); }
export async function POST(request: NextRequest) { return api(request, { auth: true, mutation: true, limit: 10 }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const result = await createOffer(actor, await readJson(request, offerInputSchema)); return ok(result, result.replayed ? 200 : 201); }); }
