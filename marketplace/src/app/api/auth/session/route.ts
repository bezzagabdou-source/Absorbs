import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { isDemoMode } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, {}, async (actor) => ok({ user: actor, demo: isDemoMode() })); }
