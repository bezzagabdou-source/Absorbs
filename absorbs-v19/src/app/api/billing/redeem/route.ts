import { json, safeDetail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { ensureSchema } from "@/db/ensure-schema";
import { db } from "@/db";
import { orders, promoCodes, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  PRO_CODE_MAX_USES,
  PRO_DAYS,
  isAllowedCode,
  normalizeCode,
} from "@/lib/promo";

export const runtime = "nodejs";

/** POST { code } — redeems one of the fixed promo codes and activates Nexus AI v8.4 Pro */
export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  // slow down code guessing
  const rl = rateLimit(`redeem:${user.uid}`, 8, 60_000);
  if (!rl.ok) {
    return json(429, { code: "RATE" }, { "Retry-After": String(rl.retryAfter) });
  }

  let code = "";
  try {
    const body = (await req.json()) as { code?: unknown };
    code = typeof body.code === "string" ? normalizeCode(body.code) : "";
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  if (!code || code.length > 40 || !isAllowedCode(code)) {
    return json(400, { code: "INVALID_CODE" });
  }

  try {
    await ensureSchema();
    await ensureUser(user);

    // 1) make sure the code row exists
    await db
      .insert(promoCodes)
      .values({ code, plan: "pro", days: PRO_DAYS, maxUses: PRO_CODE_MAX_USES })
      .onConflictDoNothing();

    // 2) atomically claim it: only ONE request can ever win, ever
    const claimed = await db
      .update(promoCodes)
      .set({ used: sql`${promoCodes.used} + 1`, active: false })
      .where(
        and(
          eq(promoCodes.code, code),
          eq(promoCodes.active, true),
          sql`${promoCodes.used} < 1`
        )
      )
      .returning({ code: promoCodes.code });
    if (claimed.length === 0) return json(400, { code: "USED" });

    // 3) activate Pro; if this fails the code is released again (not burned)
    let expires: Date;
    try {
      const u = (
        await db.select().from(users).where(eq(users.id, user.uid)).limit(1)
      )[0];
      const baseMs =
        u &&
        u.plan === "pro" &&
        u.planExpiresAt &&
        u.planExpiresAt.getTime() > Date.now()
          ? u.planExpiresAt.getTime()
          : Date.now();
      expires = new Date(baseMs + PRO_DAYS * 86_400_000);
      await db
        .update(users)
        .set({ plan: "pro", planExpiresAt: expires })
        .where(eq(users.id, user.uid));
    } catch (e) {
      await db
        .update(promoCodes)
        .set({ used: 0, active: true })
        .where(eq(promoCodes.code, code))
        .catch(() => undefined);
      throw e;
    }

    // 4) bookkeeping only — never blocks activation
    await db
      .insert(orders)
      .values({
        userId: user.uid,
        plan: "pro",
        period: "monthly",
        amountDzd: 0,
        status: "paid",
        provider: "promo",
        providerRef: code,
      })
      .catch((e) => console.error("[redeem] order log failed:", e));

    return json(200, {
      ok: true,
      days: PRO_DAYS,
      plan: "pro",
      expiresAt: expires.toISOString(),
    });
  } catch (e) {
    console.error("[redeem]", e);
    return json(500, { code: "DB", detail: safeDetail(e) });
  }
}
