/**
 * NEXUS v19 — مركز الأمان
 * ---------------------------------------------------------------------------
 *   GET    /api/user/security                     → verification state, phone, 2FA, recent sign-ins
 *   POST   /api/user/security { action, … }
 *          action="mint-code"                     → a fresh 6-digit code (emailed when a provider exists)
 *          action="verify-code" { code }          → checks it and opens a 15-minute trusted window
 *          action="revoke"                        → closes the trusted window, burns the pending code
 *          action="save-phone" { phone, verified }→ stores the Firebase-verified phone number
 *          action="two-factor" { mode }           → off · email · phone
 *   DELETE /api/user/security                     → same as action="revoke"
 *
 * Codes are stored hashed, expire in 10 minutes and burn after 5 wrong attempts.
 */
import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { ensureUser, recentLogins, syncVerified } from "@/lib/usage";
import { mintCode, revokeTrust, savePhone, securityView, setTwoFactor, verifyCode, mailProvider, type TwoFactor } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Security center data: verification state (from the signed token) + recent sign-ins. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const rl = rateLimit(`sec:${user.uid}`, 30, 60_000);
  if (!rl.ok) return json(429, { code: "RATE_LIMITED", retryAfter: rl.retryAfter });
  try {
    await ensureUser(user);
    await syncVerified(user.uid, user.emailVerified === true).catch(() => undefined);
    const [logins, sec] = await Promise.all([recentLogins(user.uid), securityView(user.uid)]);
    return json(200, {
      email: user.email ?? "",
      emailVerified: user.emailVerified === true,
      provider: user.provider === "google.com" ? "google" : "password",
      mailProvider: mailProvider(),
      security: sec,
      logins: logins.map((l) => ({
        kind: l.kind,
        provider: l.provider,
        device: deviceOf(l.userAgent),
        at: l.createdAt,
      })),
    });
  } catch (e) {
    return serverError("security", e, "DB");
  }
}

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }
  const action = typeof body.action === "string" ? body.action : "";

  try {
    /* ---- 1. mint a code ---- */
    if (action === "mint-code") {
      const rl = rateLimit(`sec-mint:${user.uid}`, 6, 10 * 60_000);
      if (!rl.ok) return json(429, { code: "RATE_LIMITED", retryAfter: rl.retryAfter });
      const out = await mintCode(user.uid, user.email ?? "");
      if (!out.ok) return json(out.code === "TOO_MANY" ? 429 : 400, out);
      return json(200, out);
    }

    /* ---- 2. verify it ---- */
    if (action === "verify-code") {
      const rl = rateLimit(`sec-verify:${user.uid}`, 12, 10 * 60_000);
      if (!rl.ok) return json(429, { code: "RATE_LIMITED", retryAfter: rl.retryAfter });
      const out = await verifyCode(user.uid, String(body.code ?? ""));
      if (!out.ok) return json(out.code === "LOCKED" ? 429 : 400, out);
      await syncVerified(user.uid, true).catch(() => undefined);
      return json(200, out);
    }

    /* ---- 3. revoke trust ---- */
    if (action === "revoke") {
      const ok = await revokeTrust(user.uid);
      return json(200, { ok, security: await securityView(user.uid) });
    }

    /* ---- 4. phone (verified by Firebase OTP on the client) ---- */
    if (action === "save-phone") {
      const phone = String(body.phone ?? "").replace(/[^\d+]/g, "").slice(0, 24);
      if (phone.length < 8) return json(400, { code: "BAD_PHONE", detail: "رقم الهاتف غير صالح" });
      const ok = await savePhone(user.uid, phone, body.verified === true);
      return json(200, { ok, security: await securityView(user.uid) });
    }

    /* ---- 5. 2FA preference ---- */
    if (action === "two-factor") {
      const mode = String(body.mode ?? "off") as TwoFactor;
      if (!["off", "email", "phone"].includes(mode)) return json(400, { code: "BAD_MODE" });
      const ok = await setTwoFactor(user.uid, mode);
      return json(200, { ok, security: await securityView(user.uid) });
    }

    return json(400, { code: "BAD_ACTION" });
  } catch (e) {
    return serverError("security:post", e, "DB");
  }
}

export async function DELETE(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const ok = await revokeTrust(user.uid);
    return json(200, { ok, security: await securityView(user.uid) });
  } catch (e) {
    return serverError("security:delete", e, "DB");
  }
}

function deviceOf(ua: string): string {
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "—";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}
