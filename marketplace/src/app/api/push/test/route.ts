import type { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { withActor } from "@/db";
import { api, ok } from "@/lib/server/http";
import { AppError } from "@/lib/server/errors";
import { pushConfigured } from "@/lib/env";
export async function POST(request: NextRequest) { return api(request, { auth: true, mutation: true, limit: 2, windowMs: 60000 }, async (actor) => { if (!actor) throw new AppError("auth_required", 401); if (!pushConfigured()) throw new AppError("push_unavailable", 503); await withActor(actor, (tx) => tx.execute(sql`select enqueue_notification(${actor.id}::uuid,'test',gen_random_uuid(),'{}'::jsonb,'/settings?section=notifications')`)); return ok({ queued: true }, 202); }); }
