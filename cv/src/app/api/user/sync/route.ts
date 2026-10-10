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
    await ensureUser(user, {
      displayName: body.displayName ?? user.name ?? null,
      photoUrl: body.photoUrl ?? user.picture ?? null,
      locale: body.locale ?? "ar",
    });
    if (body.event === "login" || body.event === "signup") {
      await recordLogin(user.uid, {
        kind: body.event,
        // trusted values come from the signed Firebase token, not from the request body
        provider: user.provider === "google.com" ? "google" : "password",
        emailVerified: user.emailVerified === true,
        userAgent: req.headers.get("user-agent") ?? "",
      }).catch((e) => console.error("[sync] recordLogin", e));
    }
    await syncVerified(user.uid, user.emailVerified === true).catch(() => undefined);
    const profile = await getProfile(user.uid);
    return json(200, { ok: true, profile });
  } catch (e) {
    return serverError("sync", e, "DB");
  }
}
