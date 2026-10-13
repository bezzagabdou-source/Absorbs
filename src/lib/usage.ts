import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type DbUser } from "@/db/schema";
import type { VerifiedUser } from "@/lib/server-auth";

/** Every new account gets all models for 7 days. */
export const TRIAL_DAYS = 7;

export function trialActive(u: DbUser): boolean {
  return !!u.trialEndsAt && u.trialEndsAt.getTime() > Date.now();
}

export function paidProActive(u: DbUser): boolean {
  if (u.plan !== "pro") return false;
  if (!u.planExpiresAt) return true; // lifetime / manually granted
  return u.planExpiresAt.getTime() > Date.now();
}

/** Pro access = redeemed/paid Pro OR the 7-day trial. Every gate goes through this. */
export function isProActive(u: DbUser): boolean {
  return paidProActive(u) || trialActive(u);
}

export async function ensureUser(v: VerifiedUser): Promise<DbUser> {
  const existing = (await db.select().from(users).where(eq(users.id, v.uid)).limit(1))[0];
  if (existing) {
    db.update(users)
      .set({ lastSeenAt: new Date(), email: v.email ?? existing.email })
      .where(eq(users.id, existing.id))
      .execute()
      .catch(() => undefined);
    return existing;
  }
  const created = await db
    .insert(users)
    .values({
      id: v.uid,
      email: v.email ?? "",
      displayName: v.name ?? null,
      photoUrl: v.picture ?? null,
      provider: v.provider ?? "password",
      emailVerified: v.emailVerified ?? false,
      trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000),
    })
    .onConflictDoNothing()
    .returning();
  const row = created[0] ?? (await db.select().from(users).where(eq(users.id, v.uid)).limit(1))[0];
  if (!row) throw new Error("Failed to create user");
  return row;
}

export function profileOf(u: DbUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.displayName,
    photo: u.photoUrl,
    pro: isProActive(u),
    paidPro: paidProActive(u),
    trial: trialActive(u),
    planExpiresAt: u.planExpiresAt?.toISOString() ?? null,
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
  };
}
