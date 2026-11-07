import type { NextRequest } from "next/server";
import { api, ok, publicQuery, readJson } from "@/lib/server/http";
import { listingFiltersSchema, listingInputSchema, parseQuery } from "@/lib/validation/schemas";
import { searchListings } from "@/features/catalog/queries";
import { createListing } from "@/features/catalog/mutations";
import { AppError } from "@/lib/server/errors";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, {}, async () => ok(await searchListings(parseQuery(listingFiltersSchema, request.nextUrl.searchParams)))); }
export async function POST(request: NextRequest) { return api(request, { auth: true, mutation: true, roles: ["seller", "admin"], limit: 10 }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); return ok(await createListing(actor, await readJson(request, listingInputSchema)), 201); }); }
