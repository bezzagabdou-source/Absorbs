import { NextRequest } from "next/server";
import {
  clientIp,
  dummyHash,
  newSessionToken,
  sessionCookie,
  sha256hex,
  verifyPassword,
} from "@/lib/auth-local";
import { rateLimit } from "@/lib/rate-limit";
import { repo } from "@/lib/repo";
import { json } from "@/lib/http";
import { validEmail } from "@/lib/auth-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 *
 * Brute-force protection:
 *   • 8 attempts / minute / IP
 *   • 5 consecutive failures on an account ⇒ 15-minute lock
 *   • identical error message for "no such email" and "wrong password"
 *   • a dummy scrypt run when the email is unknown (no timing oracle)
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`login:${ip}`, 8, 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!validEmail(email) || !password) return json(401, { code: "BAD_CREDENTIALS" });

  try {
    const user = await repo.getUserByEmail(email);

    if (!user) {
      await dummyHash(); // equalise timing
      return json(401, { code: "BAD_CREDENTIALS" });
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const retryAfter = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
      return json(423, { code: "LOCKED", retryAfter }, { "Retry-After": String(retryAfter) });
    }

    const ok = user.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!ok) {
      await repo.recordLoginFailure(user.id);
      return json(401, { code: "BAD_CREDENTIALS" });
    }

    await repo.recordLoginSuccess(user.id);

    const token = newSessionToken();
    await repo.createSession({
      userId: user.id,
      tokenHash: sha256hex(token),
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      days: 30,
    });

    return json(
      200,
      { ok: true, user: { uid: user.id, email: user.email, name: user.displayName, provider: "password" } },
      { "Set-Cookie": sessionCookie(token, req) }
    );
  } catch (e) {
    console.error("[login]", e);
    return json(500, { code: "DB" });
  }
}
