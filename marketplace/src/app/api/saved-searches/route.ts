import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { withActor } from "@/db";
import { categories, savedSearches, wilayas } from "@/db/schema";
import { api, ok, readJson } from "@/lib/server/http";
import { savedSearchSchema, idSchema } from "@/lib/validation/schemas";
import { AppError, assertFound } from "@/lib/server/errors";
import { z } from "zod";
export async function POST(request: NextRequest) { return api(request, { auth: true, mutation: true, limit: 10 }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const input = await readJson(request, savedSearchSchema); return ok(await withActor(actor, async (tx) => { const [w] = input.wilaya ? await tx.select().from(wilayas).where(eq(wilayas.code, input.wilaya)) : []; const [c] = input.category ? await tx.select().from(categories).where(eq(categories.id, input.category)) : []; if ((input.wilaya && !w) || (input.category && !c)) throw new AppError("invalid_input"); const count = await tx.select({ id: savedSearches.id }).from(savedSearches).where(eq(savedSearches.userId, actor.id)).limit(20); if (count.length >= 20) throw new AppError("rate_limited", 429); const [row] = await tx.insert(savedSearches).values({ userId: actor.id, query: input.query, wilayaCode: input.wilaya, categoryId: input.category, maxPrice: input.maxPrice?.toFixed(2) }).onConflictDoNothing().returning({ id: savedSearches.id }); return { id: row?.id ?? null }; }), 201); }); }
export async function DELETE(request: NextRequest) { return api(request, { auth: true, mutation: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { id } = await readJson(request, idSchema); await withActor(actor, async (tx) => { const [row] = await tx.delete(savedSearches).where(and(eq(savedSearches.id, id), eq(savedSearches.userId, actor.id))).returning(); assertFound(row); }); return ok({ ok: true }); }); }
