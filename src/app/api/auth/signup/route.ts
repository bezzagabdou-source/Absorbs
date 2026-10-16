import { NextRequest } from "next/server";
import crypto from "crypto";
import {
  clientIp,
  hashPassword,
  newSessionToken,
  passwordError,
  sessionCookie,
  sha256hex,
} from "@/lib/auth-local";
import { rateLimit } from "@/lib/rate-limit";
import { repo } from "@/lib/repo";
import { json } from "@/lib/http";
import { validCountry, validEmail, validName, validPhone } from "@/lib/auth-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  country?: unknown;
  terms?: unknown;
};

/**
 * POST /api/auth/signup
 *
 * Creates a local account with a complete profile (full name, email, phone,
 * country) + accepts the terms. Security: scrypt-hashed password, per-IP
 * account-creation limit, HttpOnly SameSite session cookie. New accounts get
 * a 7-day full trial.
 */
export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const rl = rateLimit(`signup:${ip}`, 3, 3_600_000); // 3 accounts / hour / IP
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });

  const body = (await req.json().catch(() => ({}))) as Body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 20) : null;
  const country = typeof body.country === "string" && body.country.trim() ? body.country.trim().slice(0, 64) : null;
  const terms = body.terms === true;

  if (!validName(name)) return json(400, { code: "BAD_INPUT", field: "name" });
  if (!validEmail(email)) return json(400, { code: "BAD_INPUT", field: "email" });
  const pwErr = passwordError(password);
  if (pwErr) return json(400, { code: "BAD_INPUT", field: "password", reason: pwErr });
  if (!validPhone(phone)) return json(400, { code: "BAD_INPUT", field: "phone" });
  if (!validCountry(country)) return json(400, { code: "BAD_INPUT", field: "country" });
  if (!terms) return json(400, { code: "BAD_INPUT", field: "terms" });

  try {
    const existing = await repo.getUserByEmail(email);
    if (existing) return json(409, { code: "EMAIL_TAKEN" });

    const passwordHash = await hashPassword(password);
    const user = await repo.createUser({
      uid: crypto.randomUUID(),
      email: email.toLowerCase(),
      name,
      phone,
      country,
      termsAt: new Date(),
      passwordHash,
    });

    const token = newSessionToken();
    await repo.createSession({
      userId: user.id,
      tokenHash: sha256hex(token),
      ip,
      userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
      days: 30,
    });

    return json(
      201,
      { ok: true, user: { uid: user.id, email: user.email, name: user.displayName, provider: "password" } },
      { "Set-Cookie": sessionCookie(token, req) }
    );
  } catch (e) {
    console.error("[signup]", e);
    return json(500, { code: "DB" });
  }
}
