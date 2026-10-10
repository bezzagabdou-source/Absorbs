import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { ensureUser, getProfile, recordLogin, syncVerified } from "@/lib/usage";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const rl = rateLimit(`sync:${user.uid}`, 40, 60_000);
  if (!rl.ok) return json(429, { code: "RATE_LIMITED", retryAfter: rl.retryAfter });

  let body: {
    displayName?: string | null;
    photoUrl?: string | null;
    locale?: string;
    /** set only by an explicit sign-in / sign-up (not by silent token refresh) */
    event?: "login" | "signup";
    provider?: string;
    emailVerified?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body ok */
  }

  try {
    // v18: the user row must exist first; the remaining writes/reads then run in parallel
    // (the DB pool is small per instance, so fewer sequential round-trips = faster login).
    const isLogin = body.event === "login" || body.event === "signup";
    await ensureUser(user, {
      displayName: body.displayName ?? user.name ?? null,
      photoUrl: body.photoUrl ?? user.picture ?? null,
      locale: body.locale ?? "ar",
    });
    const [, , profile] = await Promise.all([
      isLogin
        ? recordLogin(user.uid, {
            kind: body.event as "login" | "signup",
            // trusted values come from the signed Firebase token, not from the request body
            provider: user.provider === "google.com" ? "google" : user.provider === "phone" ? "phone" : "password",
            emailVerified: user.emailVerified === true,
            userAgent: req.headers.get("user-agent") ?? "",
          }).catch((e) => console.error("[sync] recordLogin", e))
        : Promise.resolve(),
      syncVerified(user.uid, user.emailVerified === true).catch(() => undefined),
      getProfile(user.uid),
    ]);
    return json(200, { ok: true, profile });
  } catch (e) {
    return serverError("sync", e, "DB");
  }
}
