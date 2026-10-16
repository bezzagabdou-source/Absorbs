import { NextRequest } from "next/server";
import { verifyRequest } from "@/lib/server-auth";
import { repo } from "@/lib/repo";
import { profileOf } from "@/lib/usage";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 * Resolves the caller from the session cookie (or Firebase bearer token) and
 * returns the full profile including plan / trial / account details.
 */
export async function GET(req: NextRequest) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  try {
    const row = await repo.upsertUser(user);
    return json(200, { user: profileOf(row) });
  } catch (e) {
    console.error("[auth-me]", e);
    return json(500, { code: "DB" });
  }
}
