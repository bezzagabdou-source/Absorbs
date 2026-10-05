import { db } from "@/db";
import { users, type DbUser } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { VerifiedUser } from "@/lib/server-auth";
import { ensureSchema } from "@/db/ensure-schema";

import { FREE_METER_MS, FREE_RESET_MS, FREE_BASE_COST_MS, FREE_GAP_CAP_MS } from "@/lib/limits";

/**
 * Free accounts no longer count messages: they have a time METER (percentage).
 * 100% = 2 hours of active use; at 0% it refills 2 hours later. FREE_DAILY stays as the "100%" scale
 * so every caller / header that used the old credit number now simply carries the percentage.
 */
export const FREE_DAILY = 100;
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
  | { ok: false; remaining: 0; plan: "free"; resetAt?: string | null };

/**
 * Consumes one credit for the current Algeria day.
 * Returns remaining credits so the client can update its pill.
 */
export async function consumeCredit(uid: string): Promise<CreditResult> {
  const row = (await db.select().from(users).where(eq(users.id, uid)).limit(1))[0];
  if (!row) return { ok: false, remaining: 0, plan: "free" };

  const pro = isProActive(row);
  if (pro) {
    // Pro: no meter, no time limit (the counter only feeds statistics)
    const used = await tryConsume(uid, algeriaToday(), PRO_DAILY);
    if (used === null) return { ok: false, remaining: 0, plan: "free" };
    return { ok: true, remaining: Math.max(0, PRO_DAILY - used), plan: "pro", unlimited: true };
  }

  // Free: percentage meter
  const now = Date.now();
  const st = meterState(row, now);
  if (st.locked) return { ok: false, remaining: 0, plan: "free", resetAt: st.resetAt };
  const gap = row.meterLastAt ? Math.min(FREE_GAP_CAP_MS, Math.max(0, now - row.meterLastAt.getTime())) : 0;
  const after = await chargeMeter(uid, FREE_BASE_COST_MS + gap, true);
  return { ok: true, remaining: after.percent, plan: "free", unlimited: false };
}

/** Percentage / lock state of the free meter (a passed reset time means the meter is full again). */
export function meterState(row: DbUser, now = Date.now()) {
  const resetMs = row.meterResetAt ? row.meterResetAt.getTime() : null;
  const expired = resetMs !== null && resetMs <= now;
  const used = expired ? 0 : Number(row.meterUsedMs ?? 0);
  const locked = !expired && resetMs !== null;
  const percent = locked ? 0 : Math.max(0, Math.min(100, Math.round((1 - used / FREE_METER_MS) * 100)));
  return { used, locked, percent, resetAt: locked && resetMs ? new Date(resetMs).toISOString() : null };
}

/**
 * Adds usage time to the free meter in ONE atomic statement. When it reaches 100% the meter locks and
 * a reset time (now + 2h) is stored; after that moment it is full again.
 */
export async function chargeMeter(
  uid: string,
  ms: number,
  countRun = false
): Promise<{ percent: number; locked: boolean; resetAt: string | null }> {
  const cost = Math.max(0, Math.round(ms));
  const res = await db.execute(sql`
    update barq.users
    set meter_used_ms = least(
          (case when meter_reset_at is not null and meter_reset_at <= now() then 0 else meter_used_ms end) + ${cost}::bigint,
          ${FREE_METER_MS}::bigint),
        meter_reset_at = case
          when meter_reset_at is not null and meter_reset_at > now() then meter_reset_at
          when (case when meter_reset_at is not null and meter_reset_at <= now() then 0 else meter_used_ms end) + ${cost}::bigint >= ${FREE_METER_MS}::bigint
            then now() + (${FREE_RESET_MS}::bigint * interval '1 millisecond')
          else null end,
        meter_last_at = now(),
        total_runs = total_runs + ${countRun ? 1 : 0}
    where id = ${uid}
    returning meter_used_ms, meter_reset_at
  `);
  const rows = (res as unknown as { rows?: { meter_used_ms: number | string; meter_reset_at: string | Date | null }[] }).rows ?? [];
  if (rows.length === 0) return { percent: 100, locked: false, resetAt: null };
  const used = Number(rows[0].meter_used_ms);
  const reset = rows[0].meter_reset_at ? new Date(rows[0].meter_reset_at) : null;
  const locked = reset !== null && reset.getTime() > Date.now();
  return {
    percent: locked ? 0 : Math.max(0, Math.min(100, Math.round((1 - used / FREE_METER_MS) * 100))),
    locked,
    resetAt: locked && reset ? reset.toISOString() : null,
  };
}

/** Charges the time an answer really took to stream (free accounts only; capped at 10 min per answer). */
export async function chargeStreamTime(uid: string, ms: number): Promise<void> {
  try {
    const row = (await db.select().from(users).where(eq(users.id, uid)).limit(1))[0];
    if (!row || isProActive(row)) return;
    await chargeMeter(uid, Math.min(ms, 10 * 60 * 1000), false);
  } catch (e) {
    console.error("[usage] stream charge failed", e);
  }
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

/** Gives the cost back when the AI call failed (the user shouldn't pay for our errors). */
export async function refundCredit(uid: string): Promise<void> {
  try {
    await db.execute(sql`
      update barq.users
      set meter_used_ms = case when plan <> 'pro' then greatest(meter_used_ms - ${FREE_BASE_COST_MS}::bigint, 0) else meter_used_ms end,
          meter_reset_at = case
            when plan <> 'pro' and meter_reset_at is not null and meter_reset_at > now()
                 and meter_used_ms - ${FREE_BASE_COST_MS}::bigint < ${FREE_METER_MS}::bigint then null
            else meter_reset_at end,
          credits_used = case when usage_day = ${algeriaToday()} then greatest(credits_used - 1, 0) else credits_used end,
          total_runs = greatest(total_runs - 1, 0)
      where id = ${uid}
    `);
  } catch (e) {
    console.error("[usage] refund failed", e);
  }
}

export async function getProfile(uid: string) {
  const row = (await db.select().from(users).where(eq(users.id, uid)).limit(1))[0];
  if (!row) return null;
  const pro = isProActive(row);
  const st = meterState(row);
  // free: creditsLeft is the PERCENTAGE left (dailyLimit = 100), so every existing bar keeps working
  return {
    user: row,
    plan: (pro ? "pro" : "free") as "pro" | "free",
    creditsUsed: pro ? 0 : 100 - st.percent,
    creditsLeft: pro ? PRO_DAILY : st.percent,
    dailyLimit: pro ? PRO_DAILY : 100,
    meterPercent: pro ? 100 : st.percent,
    meterResetAt: pro ? null : st.resetAt,
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
