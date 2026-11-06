import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { api, ok } from "@/lib/server/http";
import type { NextRequest } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) { return api(request, { limit: 30 }, async () => { await getDb().execute(sql`select 1`); return ok({ ok: true }); }); }
