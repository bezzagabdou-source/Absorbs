import { json, serverError } from "@/lib/http";
import { verifyRequest } from "@/lib/server-auth";
import { rateLimit } from "@/lib/rate-limit";
import { ensureUser, recentLogins, syncVerified } from "@/lib/usage";

export const runtime = "nodejs";

/** Security center data: verification state (from the signed token) + recent sign-ins. */
export async function GET(req: Request) {
  const user = await verifyRequest(req);
  if (!user) return json(401, { code: "UNAUTHENTICATED" });
  const rl = rateLimit(`sec:${user.uid}`, 30, 60_000);
  if (!rl.ok) return json(429, { code: "RATE_LIMITED", retryAfter: rl.retryAfter });
  try {
    await ensureUser(user);
    await syncVerified(user.uid, user.emailVerified === true).catch(() => undefined);
    const logins = await recentLogins(user.uid);
    return json(200, {
      email: user.email ?? "",
      emailVerified: user.emailVerified === true,
      provider: user.provider === "google.com" ? "google" : "password",
      logins: logins.map((l) => ({
        kind: l.kind,
        provider: l.provider,
        device: deviceOf(l.userAgent),
        at: l.createdAt,
      })),
    });
  } catch (e) {
    return serverError("security", e, "DB");
  }
}

function deviceOf(ua: string): string {
  const os = /android/i.test(ua) ? "Android" : /iphone|ipad|ios/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "—";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "";
  return br ? `${os} · ${br}` : os;
}
