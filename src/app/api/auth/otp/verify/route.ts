import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { isOtpPurpose, markEmailVerified, verifyCode } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Checks a 6-digit code. Single use, 10-minute life, 5 attempts.
 *   POST { email, code, purpose? }
 * A successful `verify_email` / `security` check flags the profile as verified.
 */
export async function POST(req: Request): Promise<Response> {
  let body: { email?: unknown; code?: unknown; purpose?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!EMAIL_RE.test(email) || email.length > 160) return json(400, { code: "BAD_EMAIL" });
  if (code.replace(/\D/g, "").length !== 6) return json(400, { code: "BAD_CODE" });
  const purpose = isOtpPurpose(body.purpose) ? body.purpose : "verify_email";

  const user = await verifyRequest(req).catch(() => null);
  const key = user?.uid ?? `ip:${(req.headers.get("x-forwarded-for") ?? "?").split(",")[0].trim()}`;
  const rl = rateLimit(`otp-chk:${key}`, 12, 10 * 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter });

  let r: Awaited<ReturnType<typeof verifyCode>>;
  try {
    r = await verifyCode({ email, code, purpose, userId: user?.uid ?? null });
  } catch (e) {
    console.error("[otp] verify failed:", e instanceof Error ? e.message : String(e));
    return json(503, { code: "DB" });
  }
  if (!r.ok) return json(r.code === "LOCKED" ? 429 : 400, { code: r.code });

  if (purpose !== "login") {
    await markEmailVerified(email).catch(() => undefined);
  }
  return json(200, { ok: true, verified: purpose !== "login" });
}
