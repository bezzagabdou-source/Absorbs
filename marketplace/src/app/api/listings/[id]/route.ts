import type { NextRequest } from "next/server";
import { api, ok, readJson } from "@/lib/server/http";
import { idSchema, listingUpdateSchema } from "@/lib/validation/schemas";
import { getProduct, recordProductView } from "@/features/catalog/queries";
import { updateListing } from "@/features/catalog/mutations";
import { AppError, assertFound } from "@/lib/server/errors";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) { return api(request, {}, async () => { const { id } = idSchema.parse(await context.params); const product = await getProduct(id); assertFound(product); if (request.nextUrl.searchParams.get("view") === "true") await recordProductView(id); return ok({ product }); }); }
export async function PATCH(request: NextRequest, context: Context) { return api(request, { auth: true, mutation: true, roles: ["seller", "admin"] }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { id } = idSchema.parse(await context.params); return ok(await updateListing(actor, id, await readJson(request, listingUpdateSchema))); }); }
