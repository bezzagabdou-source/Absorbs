import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { getReferenceData } from "@/features/catalog/queries";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, {}, async () => ok(await getReferenceData())); }
