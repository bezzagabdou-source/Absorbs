import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { api, ok, readJson } from "@/lib/server/http";
import { issueSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { verifyGoogleIdToken, googleSignInConfigured } from "@/lib/auth/google";
import { AppError } from "@/lib/server/errors";

const googleSchema = z.object({ idToken: z.string().min(100).max(8000) }).strict();

/**
 * Google sign-in through Firebase.
 *
 * The browser runs the Google popup/redirect with the Firebase SDK and posts the
 * resulting ID token here. We verify it server-side (signature, audience,
 * issuer, expiry, provider) and then reuse the existing session machinery, so a
 * Google account behaves exactly like a password account for offers, listings,
 * messages and the seller dashboard.
 *
 * Accounts created this way get an unusable random password hash: password
 * sign-in can never succeed for them (the plaintext does not exist), while the
 * account still satisfies the existing `authenticate_account` lookup and the
 * unique e-mail index used for account linking.
 */
export async function POST(request: NextRequest) {
  return api(request, { mutation: true, limit: 10, windowMs: 900000 }, async () => {
    if (!googleSignInConfigured()) throw new AppError("google_not_configured", 503);
    const { idToken } = await readJson(request, googleSchema, 12000);
    const identity = await verifyGoogleIdToken(idToken);

    const existing = await getDb().execute(sql`select id from authenticate_account(${identity.email})`);
    const row = existing.rows[0] as { id: string } | undefined;
    if (row?.id) {
      // Linking a Google identity to an existing account requires a verified Google e-mail.
      if (!identity.emailVerified) throw new AppError("google_email_unverified", 403);
      await issueSession(row.id);
      return ok({ ok: true, created: false });
    }

    const displayName = identity.name ?? identity.email.split("@")[0];
    const cookieLocale = (request.cookies.get("dz_locale")?.value ?? "ar").slice(0, 2);
    const locale = ["ar", "en", "fr"].includes(cookieLocale) ? cookieLocale : "ar";
    const unusablePassword = await hashPassword(randomBytes(32).toString("hex"));
    try {
      const created = await getDb().execute(sql`select register_account(${identity.email}, ${unusablePassword}, ${displayName}, 'buyer'::user_role, ${locale}) as id`);
      const id = String((created.rows[0] as { id: string }).id);
      await getDb().execute(sql`update users set email_verified_at = now(), updated_at = now() where id = ${id}::uuid`);
      await issueSession(id);
      return ok({ ok: true, created: true }, 201);
    } catch (error) {
      // Concurrent first sign-in: the unique e-mail index fired, so log in instead.
      if ((error as { cause?: { code?: string } }).cause?.code === "23505") {
        const retry = await getDb().execute(sql`select id from authenticate_account(${identity.email})`);
        const again = retry.rows[0] as { id: string } | undefined;
        if (again?.id) { await issueSession(again.id); return ok({ ok: true, created: false }); }
      }
      throw error;
    }
  });
}
