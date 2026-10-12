import { json } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { verifyRequest } from "@/lib/server-auth";
import { issueCode, isOtpPurpose, sweepCodes } from "@/lib/otp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Sends a 6-digit one-time code by email.
 *   POST { email, purpose?: "verify_email" | "login" | "security" }
 * The code is only ever returned when OTP_PREVIEW=1 (local development).
 */
export async function POST(req: Request): Promise<Response> {
  let body: { email?: unknown; purpose?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { code: "BAD_BODY" });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > 160) return json(400, { code: "BAD_EMAIL" });
  const purpose = isOtpPurpose(body.purpose) ? body.purpose : "verify_email";

  // the logged-in user is attached when we have one; anonymous requests are allowed
  const user = await verifyRequest(req).catch(() => null);
  const key = user?.uid ?? `ip:${(req.headers.get("x-forwarded-for") ?? "?").split(",")[0].trim()}`;

  const rl = rateLimit(`otp-req:${key}`, 5, 10 * 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter });

  void sweepCodes().catch(() => undefined);

  const r = await issueCode({
    email,
    purpose,
    userId: user?.uid ?? null,
    ip: (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim(),
  });

  if (!r.ok) {
    if (r.code === "RATE") return json(429, { code: "COOLDOWN", retryAfter: r.retryAfter ?? 60 });
    return json(503, { code: "MAIL_NOT_CONFIGURED" });
  }
  return json(200, {
    ok: true,
    sentTo: r.sentTo,
    retryAfter: r.retryAfter,
    ttl: r.ttl,
    ...(r.previewCode ? { previewCode: r.previewCode } : {}),
  });
}
