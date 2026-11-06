import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { api, ok, readJson } from "@/lib/server/http";
import { credentialsSchema } from "@/lib/validation/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { issueSession } from "@/lib/auth/session";
import { AppError } from "@/lib/server/errors";
export async function POST(request: NextRequest) { return api(request, { mutation: true, limit: 10, windowMs: 900000 }, async () => { const input = await readJson(request, credentialsSchema); const result = await getDb().execute(sql`select * from authenticate_account(${input.email})`); const row = result.rows[0] as { id: string; password_hash: string | null } | undefined; if (!await verifyPassword(input.password, row?.password_hash ?? null) || !row) throw new AppError("invalid_credentials", 401); await issueSession(row.id); return ok({ ok: true }); }); }
