import type { NextRequest } from "next/server";
import { z } from "zod";
import { api, ok, readJson } from "@/lib/server/http";
import { isDemoMode } from "@/lib/env";
import { AppError } from "@/lib/server/errors";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
export async function POST(request: NextRequest) { return api(request, { mutation: true, limit: 10 }, async () => { if (!isDemoMode()) throw new AppError("not_found", 404); const { role } = await readJson(request, z.object({ role: z.enum(["buyer", "seller"]) }).strict()); const result = await getDb().execute(sql`select * from authenticate_account(${role + "@preview.invalid"})`); const row = result.rows[0] as { id: string; password_hash: string }; if (!row || !await verifyPassword("Preview-Only-2026!", row.password_hash)) throw new AppError("not_found", 404); await issueSession(row.id); return ok({ ok: true }); }); }
