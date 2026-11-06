import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withActor } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { api, ok, readJson } from "@/lib/server/http";
import { pushSubscriptionSchema } from "@/lib/validation/schemas";
import { AppError } from "@/lib/server/errors";
import { pushConfigured, pushEndpointAllowed } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) { return api(request, { auth: true, mutation: true, limit: 10 }, async (actor) => {
  if (!actor) throw new AppError("auth_required", 401); if (!pushConfigured()) throw new AppError("push_unavailable", 503);
  const input = await readJson(request, pushSubscriptionSchema);
  if (!pushEndpointAllowed(input.endpoint)) throw new AppError("invalid_input", 400, { endpoint: ["push_endpoint_not_allowed"] });
  await withActor(actor, async (tx) => {
    const [existing] = await tx.select({ userId: pushSubscriptions.userId }).from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, input.endpoint)).for("update");
    if (existing && existing.userId !== actor.id) throw new AppError("subscription_conflict", 409);
    await tx.insert(pushSubscriptions).values({ userId: actor.id, endpoint: input.endpoint, keys: input.keys, locale: input.locale, userAgent: request.headers.get("user-agent")?.slice(0, 500) }).onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { keys: input.keys, locale: input.locale, updatedAt: new Date() } });
  });
  return ok({ ok: true }, 201);
}); }
export async function DELETE(request: NextRequest) { return api(request, { auth: true, mutation: true }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); const { endpoint } = await readJson(request, z.object({ endpoint: z.url().max(2048) }).strict()); await withActor(actor, (tx) => tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.endpoint, endpoint), eq(pushSubscriptions.userId, actor.id)))); return ok({ ok: true }); }); }
