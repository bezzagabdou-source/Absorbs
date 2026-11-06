import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { notifications } from "@/db/schema";
import { withActor } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
export async function getNotifications(actor: SessionUser) { return withActor(actor, (tx) => tx.select().from(notifications).where(eq(notifications.userId, actor.id)).orderBy(desc(notifications.createdAt)).limit(50)); }
export async function markNotifications(actor: SessionUser, ids?: string[]) { return withActor(actor, async (tx) => { await tx.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt), ids ? inArray(notifications.id, ids) : undefined)); return { ok: true }; }); }
