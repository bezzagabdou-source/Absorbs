import { db } from "@/db";
import { users, type DbUser } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { VerifiedUser } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";

/** Free accounts: 20 tries per Algeria day (resets at midnight Africa/Algiers). */
export const FREE_DAILY = 20;
/** Pro is unlimited — this ceiling only exists so the SQL counter has a number to compare with. */
export const PRO_DAILY = 1_000_000;

/** Today's date in Africa/Algiers (YYYY-MM-DD) */
export function algeriaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function isProActive(u: DbUser): boolean {
  if (u.plan !== "pro") return false;
  if (!u.planExpiresAt) return true; // lifetime / manually granted
  return u.planExpiresAt.getTime() > Date.now();
}

export async function ensureUser(
  v: VerifiedUser,
  opts: { displayName?: string | null; photoUrl?: string | null; locale?: string } = {}
): Promise<DbUser> {
  const existing = await db.select().from(users).where(eq(users.id, v.uid)).limit(1);
  if (existing[0]) {
    const u = existing[0];
    db.update(users)
      .set({
        lastSeenAt: new Date(),
        ...(opts.displayName ? { displayName: opts.displayName } : {}),
        ...(opts.photoUrl ? { photoUrl: opts.photoUrl } : {}),
        email: v.email ?? u.email,
      })
      .where(eq(users.id, u.id))
      .execute()
      .catch(() => undefined);
    return u;
  }
  const created = await db
    .insert(users)
    .values({
      id: v.uid,
      email: v.email ?? "",
      displayName: opts.displayName ?? v.name ?? null,
      photoUrl: opts.photoUrl ?? v.picture ?? null,
      locale: opts.locale ?? "ar",
    })
    .onConflictDoNothing()
    .returning();
  const row =
    created[0] ??
    (await db.select().from(users).where(eq(users.id, v.uid)).limit(1))[0];
  if (!row) throw new Error("Failed to create user");
  return row;
}

export type CreditResult =
  | { ok: true; remaining: number; plan: "free" | "pro"; unlimited: boolean }
  | { ok: false; remaining: 0; plan: "free" };

/**
 * Consumes one credit for the current Algeria day.
 * Returns remaining credits so the client can update its pill.
 */
export async function consumeCredit(uid: string): Promise<CreditResult> {
  const row = (await db.select().from(users).where(eq(users.id, uid)).limit(1))[0];
  if (!row) return { ok: false, remaining: 0, plan: "free" };

  const today = algeriaToday();
  const pro = isProActive(row);
  const limit = pro ? PRO_DAILY : FREE_DAILY;

  const used = await tryConsume(uid, today, limit);
  if (used === null) {
    return { ok: false, remaining: 0, plan: "free" };
  }

  const remaining = Math.max(0, limit - used);
  return {
    ok: true,
    remaining,
    plan: pro ? "pro" : "free",
    unlimited: false,
  };
}

/**
 * Single atomic statement: concurrent requests can no longer bypass the limit.
 * Returns the new credits_used, or null when the daily limit is reached / user missing.
 */
export async function tryConsume(
  uid: string,
  today: string,
  limit: number
): Promise<number | null> {
  const res = await db.execute(sql`
    update barq.users
    set usage_day = ${today},
        credits_used = case when usage_day = ${today} then credits_used + 1 else 1 end,
        total_runs = total_runs + 1
    where id = ${uid}
      and (case when usage_day = ${today} then credits_used else 0 end) < ${limit}
    returning credits_used
  `);
  const rows = (res as unknown as { rows?: { credits_used: number }[] }).rows ?? [];
  return rows.length === 0 ? null : Number(rows[0].credits_used);
}

/** Gives the credit back when the AI call failed (the user shouldn't pay for our errors). */
export async function refundCredit(uid: string): Promise<void> {
  try {
    await db.execute(sql`
      update barq.users
      set credits_used = greatest(credits_used - 1, 0),
          total_runs = greatest(total_runs - 1, 0)
      where id = ${uid} and usage_day = ${algeriaToday()}
    `);
  } catch (e) {
    console.error("[usage] refund failed", e);
  }
}

export async function getProfile(uid: string) {
  const row = (await db.select().from(users).where(eq(users.id, uid)).limit(1))[0];
  if (!row) return null;
  const today = algeriaToday();
  const pro = isProActive(row);
  const limit = pro ? PRO_DAILY : FREE_DAILY;
  const used = row.usageDay === today ? row.creditsUsed : 0;
  return {
    user: row,
    plan: (pro ? "pro" : "free") as "pro" | "free",
    creditsUsed: used,
    creditsLeft: Math.max(0, limit - used),
    dailyLimit: limit,
    planExpiresAt: row.planExpiresAt,
  };
}


/**
 * Self-healing credit take: creates tables + the user row if they are missing,
 * then consumes one credit. If the database itself is unreachable we do NOT
 * block the chat (the AI only needs the API key) — `tracked` tells callers
 * whether there is anything to refund / persist.
 */
export async function takeCredit(
  v: VerifiedUser
): Promise<(CreditResult & { tracked: boolean }) | null> {
  try {
    await ensureSchema();
    await ensureUser(v);
    const c = await consumeCredit(v.uid);
    return { ...c, tracked: true };
  } catch (e) {
    console.error("[usage] database unavailable, continuing without credits:", e);
    return null;
  }
}


/** Real sign-in / sign-up bookkeeping (counter + last login + security trail). */
export async function recordLogin(
  uid: string,
  o: { kind: "login" | "signup"; provider: string; emailVerified: boolean; userAgent: string }
): Promise<void> {
  const provider = o.provider === "google" ? "google" : "password";
  await db.execute(sql`
    update barq.users
    set login_count = login_count + 1,
        last_login_at = now(),
        provider = ${provider},
        email_verified = ${o.emailVerified}
    where id = ${uid}
  `);
  await db.execute(sql`
    insert into barq.login_events (user_id, kind, provider, user_agent)
    values (${uid}, ${o.kind}, ${provider}, ${o.userAgent.slice(0, 200)})
  `);
}


/** Keeps users.email_verified equal to the signed token claim. */
export async function syncVerified(uid: string, verified: boolean): Promise<void> {
  await db.execute(sql`update barq.users set email_verified = ${verified} where id = ${uid} and email_verified <> ${verified}`);
}

/** Last sign-ins of one user (security center). */
export async function recentLogins(uid: string, limit = 12) {
  const r = await db.execute(sql`
    select kind, provider, user_agent as "userAgent", created_at as "createdAt"
    from barq.login_events where user_id = ${uid}
    order by created_at desc limit ${limit}
  `);
  const rows = (r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[]);
  return rows as { kind: string; provider: string; userAgent: string; createdAt: string }[];
}
