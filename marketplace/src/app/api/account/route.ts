import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, withActor } from "@/db";
import { api, ok, readJson } from "@/lib/server/http";
import { preferencesSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/server/errors";
import { vendorListings } from "@/features/catalog/mutations";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, { auth: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); return ok({ user: actor, listings: actor.role === "seller" || actor.role === "admin" ? await vendorListings(actor) : [] }); }); }
export async function PATCH(request: NextRequest) { return api(request, { auth: true, mutation: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const prefs = await readJson(request, preferencesSchema); await withActor(actor, async (tx) => { await tx.execute(sql`select update_preferences(${actor.id}::uuid, ${JSON.stringify(prefs)}::jsonb)`); }); return ok({ preferences: prefs }); }); }
