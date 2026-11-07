import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { api, ok, readJson } from "@/lib/server/http";
import { registerSchema } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/auth/password";
import { issueSession } from "@/lib/auth/session";
import { AppError } from "@/lib/server/errors";
export async function POST(request: NextRequest) { return api(request, { mutation: true, limit: 5, windowMs: 3600000 }, async () => { const input = await readJson(request, registerSchema); const hash = await hashPassword(input.password); try { const result = await getDb().execute(sql`select register_account(${input.email}, ${hash}, ${input.displayName}, ${input.role}::user_role, ${input.locale}) as id`); await issueSession(String(result.rows[0].id)); return ok({ ok: true }, 201); } catch (error) { if ((error as { cause?: { code?: string } }).cause?.code === "23505") throw new AppError("email_taken", 409); throw error; } }); }
