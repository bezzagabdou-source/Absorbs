import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { dashboardQuerySchema, parseQuery } from "@/lib/validation/schemas";
import { getDashboard } from "@/features/dashboard/queries";
import { AppError } from "@/lib/server/errors";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, { auth: true, roles: ["seller", "admin"] }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { days } = parseQuery(dashboardQuerySchema, request.nextUrl.searchParams); return ok(await getDashboard(actor, days as 7 | 30 | 90)); }); }
