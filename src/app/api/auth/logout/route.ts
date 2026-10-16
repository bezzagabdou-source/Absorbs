import { NextRequest } from "next/server";
import { clearSessionCookie, readSessionToken, sha256hex } from "@/lib/auth-local";
import { repo } from "@/lib/repo";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/logout — revokes the current session and clears the cookie. */
export async function POST(req: NextRequest) {
  try {
    const token = readSessionToken(req);
    if (token && token.length === 64) {
      await repo.revokeSession(sha256hex(token)).catch(() => undefined);
    }
  } catch {
    /* revocation is best-effort */
  }
  return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}
