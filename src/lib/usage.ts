import { repo, type UserRow } from "@/lib/repo";
import type { VerifiedUser } from "@/lib/server-auth";

/** Every new account gets all models for 7 days (same as Absorbs). */
export const TRIAL_DAYS = 7;

export function trialActive(u: UserRow): boolean {
  return !!u.trialEndsAt && u.trialEndsAt.getTime() > Date.now();
}

export function paidProActive(u: UserRow): boolean {
  if (u.plan !== "pro") return false;
  if (!u.planExpiresAt) return true; // lifetime / manually granted
  return u.planExpiresAt.getTime() > Date.now();
}

/** Pro access = redeemed/paid Pro OR the 7-day trial. Every gate goes through this. */
export function isProActive(u: UserRow): boolean {
  return paidProActive(u) || trialActive(u);
}

/** Fetches the caller's row, creating it on first sign-in (Firebase users included). */
export async function ensureUser(v: VerifiedUser): Promise<UserRow> {
  return repo.upsertUser({
    uid: v.uid,
    email: v.email,
    name: v.name,
    picture: v.picture,
    provider: v.provider,
  });
}

export function profileOf(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.displayName,
    photo: u.photoUrl,
    phone: u.phone,
    country: u.country,
    pro: isProActive(u),
    paidPro: paidProActive(u),
    trial: trialActive(u),
    planExpiresAt: u.planExpiresAt?.toISOString() ?? null,
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
  };
}
