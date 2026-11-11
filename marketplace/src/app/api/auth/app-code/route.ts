import type { NextRequest } from "next/server";
import { api, ok } from "@/lib/server/http";
import { getSession } from "@/lib/auth/session";
import { AppError } from "@/lib/server/errors";
import { createHandoffCode } from "@/lib/server/handoff-schema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Issues a 120-second, single-use code that lets the Android app pick up the
 * session just created in the user's browser (Google sign-in happens in the
 * browser, because Google refuses OAuth inside embedded WebViews).
 *
 * The plain code is returned once and never stored: only its SHA-256 hash is
 * kept, together with the owning user and the expiry.
 */
export async function POST(request: NextRequest) {
  return api(request, { mutation: true, limit: 12, windowMs: 60000 }, async () => {
    const actor = await getSession();
    if (!actor) throw new AppError("auth_required", 401);
    return ok({ code: await createHandoffCode(actor.id), expiresIn: 120 });
  });
}
