import { json } from "@/lib/http";
import { firebaseConfig } from "@/lib/firebase-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/auth/diagnose — "is Google sign-in broken because of my setup or is it a glitch?"
 * Reads the project's public auth config (the same call the Firebase SDK makes) and checks that the
 * host you are visiting from is in Firebase → Authentication → Settings → Authorized domains.
 * Exposes nothing secret: the web API key and the domain list are public by design.
 */
export async function GET(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  const out: Record<string, unknown> = {
    host,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    sameDomainAuthProxy: process.env.NEXT_PUBLIC_FIREBASE_AUTH_PROXY === "1",
  };
  try {
    const r = await fetch(
      `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) {
      return json(200, {
        ...out,
        ok: false,
        problem: r.status === 400 || r.status === 403 ? "API_KEY_REJECTED" : "FIREBASE_UNREACHABLE",
        hint:
          r.status === 400 || r.status === 403
            ? "The Firebase web API key is invalid or restricted. Check Google Cloud → APIs & Services → Credentials (HTTP referrer restrictions must include this domain)."
            : `Firebase answered HTTP ${r.status}. Retry in a minute.`,
      });
    }
    const cfg = (await r.json()) as { authorizedDomains?: string[] };
    const domains = (cfg.authorizedDomains ?? []).map((d) => d.toLowerCase());
    const authorized = domains.some((d) => host === d || host.endsWith(`.${d}`));
    return json(200, {
      ...out,
      ok: authorized,
      authorizedDomains: domains,
      problem: authorized ? null : "DOMAIN_NOT_AUTHORIZED",
      hint: authorized
        ? "Domain is authorized. If Google sign-in still fails: enable Google in Authentication → Sign-in method, allow pop-ups, and avoid in-app browsers."
        : `Add "${host}" in Firebase console → Authentication → Settings → Authorized domains, then retry.`,
    });
  } catch {
    return json(200, { ...out, ok: false, problem: "FIREBASE_UNREACHABLE", hint: "Could not reach Firebase from the server (network/DNS)." });
  }
}
