/**
 * Verifies Firebase ID tokens server-side without the Admin SDK.
 *
 * Official method: check the RS256 signature against Google's public keys
 * (securetoken JWKS) and validate the standard claims (exp, aud, iss, sub).
 * Uses only Node's built-in `crypto` — no extra dependency.
 */
import crypto from "crypto";
import { firebaseConfig } from "@/lib/firebase-config";
import { ensureSchema } from "@/db/ensure-schema";

export type VerifiedUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  /** from the signed token, never from the client */
  emailVerified?: boolean;
  provider?: string;
};

const PROJECT_ID = firebaseConfig.projectId;
const ISSUER = `https://securetoken.google.com/${PROJECT_ID}`;
const JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

type Jwk = crypto.JsonWebKey & { kid?: string };
type JwkCache = { keys: Map<string, Jwk>; fetchedAt: number };

const g = globalThis as typeof globalThis & {
  __barqJwks?: JwkCache;
  __barqTokenCache?: Map<string, { user: VerifiedUser; expiry: number }>;
};
const tokenCache =
  g.__barqTokenCache ?? (g.__barqTokenCache = new Map());

async function loadJwks(force = false): Promise<Map<string, Jwk>> {
  const c = g.__barqJwks;
  if (!force && c && Date.now() - c.fetchedAt < 60 * 60 * 1000) return c.keys;
  const res = await fetch(JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  const keys = new Map<string, Jwk>();
  for (const k of data.keys ?? []) if (k.kid) keys.set(k.kid, k);
  g.__barqJwks = { keys, fetchedAt: Date.now() };
  return keys;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Pure verification given a key set — exported for testing. */
export function verifyIdTokenWithKeys(
  token: string,
  keys: Map<string, Jwk>,
  now = Date.now()
): { user: VerifiedUser; expMs: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header: { alg?: string; kid?: string };
  let payload: {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    firebase?: { sign_in_provider?: string };
  };
  try {
    header = JSON.parse(b64urlToBuf(parts[0]).toString("utf8"));
    payload = JSON.parse(b64urlToBuf(parts[1]).toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const jwk = keys.get(header.kid);
  if (!jwk) return null;

  let ok = false;
  try {
    const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
    ok = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      pub,
      b64urlToBuf(parts[2])
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  const nowSec = Math.floor(now / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= nowSec) return null;
  if (typeof payload.iat === "number" && payload.iat > nowSec + 300) return null;
  if (payload.aud !== PROJECT_ID || payload.iss !== ISSUER) return null;
  if (!payload.sub || typeof payload.sub !== "string") return null;

  return {
    user: {
      uid: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      emailVerified: payload.email_verified === true,
      provider: payload.firebase?.sign_in_provider,
    },
    expMs: payload.exp * 1000,
  };
}

export async function verifyRequest(req: Request): Promise<VerifiedUser | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token.length < 100 || token.length > 4096) return null;

  const hit = tokenCache.get(token);
  if (hit && hit.expiry > Date.now() + 15_000) return hit.user;

  try {
    let keys = await loadJwks();
    let result = verifyIdTokenWithKeys(token, keys);
    if (!result) {
      // unknown kid? Google rotates keys — refresh once, but not more than every minute
      const c = g.__barqJwks;
      if (c && Date.now() - c.fetchedAt > 60_000) {
        keys = await loadJwks(true);
        result = verifyIdTokenWithKeys(token, keys);
      }
    }
    if (!result) return null;

    // make sure tables exist before any DB work (failure must not look like a bad login)
    await ensureSchema().catch((e) => console.error("[db] ensureSchema:", e));

    if (tokenCache.size > 2000) tokenCache.clear();
    tokenCache.set(token, {
      user: result.user,
      expiry: Math.min(result.expMs, Date.now() + 900_000),
    });
    return result.user;
  } catch (e) {
    console.error("[auth] verification error:", e);
    return null;
  }
}
