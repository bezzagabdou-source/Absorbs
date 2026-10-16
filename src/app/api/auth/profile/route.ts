import { NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { repo } from "@/lib/repo";
import { profileOf } from "@/lib/usage";
import { json, safeDetail } from "@/lib/http";
import { validCountry, validName, validPhone } from "@/lib/auth-validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { name?: unknown; phone?: unknown; country?: unknown };

/** PATCH /api/auth/profile — update the account's own details (name / phone / country). */
export async function PATCH(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });

  const rl = rateLimit(`profile:${user.uid}`, 20, 60_000);
  if (!rl.ok) return json(429, { code: "RATE", retryAfter: rl.retryAfter }, { "Retry-After": String(rl.retryAfter) });

  const body = (await req.json().catch(() => ({}))) as Body;
  const patch: { displayName?: string | null; phone?: string | null; country?: string | null } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!validName(name)) return json(400, { code: "BAD_INPUT", field: "name" });
    patch.displayName = name;
  }
  if (body.phone !== undefined) {
    const phone = typeof body.phone === "string" && body.phone.trim() ? body.phone.trim().slice(0, 20) : null;
    if (!validPhone(phone)) return json(400, { code: "BAD_INPUT", field: "phone" });
    patch.phone = phone;
  }
  if (body.country !== undefined) {
    const country = typeof body.country === "string" && body.country.trim() ? body.country.trim().slice(0, 64) : null;
    if (!validCountry(country)) return json(400, { code: "BAD_INPUT", field: "country" });
    patch.country = country;
  }

  try {
    const row = await repo.updateProfile(user.uid, patch);
    if (!row) return json(404, { code: "NOT_FOUND" });
    return json(200, { user: profileOf(row) });
  } catch (e) {
    console.error("[profile]", e);
    return json(500, { code: "DB", detail: safeDetail(e) });
  }
}
