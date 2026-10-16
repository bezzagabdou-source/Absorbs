import { NextRequest } from "next/server";
import { json, safeDetail } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { ensureUser } from "@/lib/usage";
import { repo } from "@/lib/repo";
import {
  PRO_CODE_MAX_USES,
  PRO_DAYS,
  isAllowedCode,
  normalizeCode,
} from "@/lib/promo";

export const runtime = "nodejs";

/** POST { code } — redeems one of the fixed promo codes and activates Nexus AI Pro */
export async function POST(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  // slow down code guessing
  const rl = rateLimit(`redeem:${user.uid}`, 8, 60_000);
  if (!rl.ok) {
    return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });
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
    await ensureUser(user);

    // 1) make sure the code row exists
    await repo.ensurePromo(code, { plan: "pro", days: PRO_DAYS, maxUses: PRO_CODE_MAX_USES });

    // 2) atomically claim it: only ONE request can ever win, ever
    const claimed = await repo.claimPromo(code);
    if (!claimed) return json(400, { code: "USED" });

    // 3) activate Pro; if this fails the code is released again (not burned)
    let expires: Date;
    try {
      const u = await repo.getUser(user.uid);
      const baseMs =
        u &&
        u.plan === "pro" &&
        u.planExpiresAt &&
        u.planExpiresAt.getTime() > Date.now()
          ? u.planExpiresAt.getTime()
          : Date.now();
      expires = new Date(baseMs + PRO_DAYS * 86_400_000);
      await repo.setPlan(user.uid, "pro", expires);
    } catch (e) {
      await repo.releasePromo(code).catch(() => undefined);
      throw e;
    }

    // 4) bookkeeping only — never blocks activation
    await repo.logOrder(user.uid, code);

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
