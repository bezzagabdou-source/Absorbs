import "server-only";

/**
 * Firebase ID-token verification for Google sign-in.
 *
 * The browser signs in with Firebase (Google provider), gets a short-lived JWT
 * and posts it to /api/auth/google. We verify it here against Google's public
 * certificates before trusting any claim:
 *   - signature (RS256, certificates fetched from googleapis.com and cached),
 *   - `aud` is the configured Firebase project,
 *   - `iss` is https://securetoken.google.com/<project>,
 *   - `exp` / `iat` / `sub` are present and sane.
 *
 * Only the mail identity of the provider is used: password sign-in keeps working
 * unchanged, and a Google account can never take over an existing local account
 * unless the email is already verified by Google.
 */
import { createPublicKey, verify as verifySignature, type JsonWebKey } from "node:crypto";
import { AppError } from "@/lib/server/errors";

type FirebaseCert = JsonWebKey & { kid?: string };

export type GoogleIdentity = {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
  signInProvider: string;
};

const CERT_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let cache: { fetchedAt: number; certs: Record<string, string> } | null = null;

function firebaseProjectId(): string | null {
  const id = process.env.FIREBASE_PROJECT_ID?.trim() || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  return id && /^[a-z0-9-]{3,64}$/i.test(id) ? id : null;
}

/** True when Google sign-in can be offered by this deployment. */
export function googleSignInConfigured(): boolean {
  return Boolean(firebaseProjectId() || process.env.FIREBASE_PROJECT_ID);
}

async function certificates(fetchImpl: typeof fetch): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < 55 * 60 * 1000) return cache.certs;
  const response = await fetchImpl(CERT_URL, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new AppError("google_unavailable", 503);
  const body = await response.json() as Record<string, string>;
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) throw new AppError("google_unavailable", 503);
  cache = { fetchedAt: now, certs: body };
  return body;
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

/**
 * Verifies a Firebase ID token. `fetchImpl` is injectable for tests.
 * Throws AppError("google_invalid_token") for anything that does not verify.
 */
export async function verifyGoogleIdToken(idToken: string, fetchImpl: typeof fetch = fetch): Promise<GoogleIdentity> {
  if (typeof idToken !== "string" || idToken.length < 100 || idToken.length > 8000) throw new AppError("google_invalid_token", 401);
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new AppError("google_invalid_token", 401);
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodePart(encodedHeader);
  const payload = decodePart(encodedPayload);
  if (!header || !payload) throw new AppError("google_invalid_token", 401);
  if (header.alg !== "RS256") throw new AppError("google_invalid_token", 401);
  const kid = typeof header.kid === "string" ? header.kid : null;
  if (!kid) throw new AppError("google_invalid_token", 401);

  const projectId = firebaseProjectId();
  if (!projectId) throw new AppError("google_not_configured", 503);
  const now = Math.floor(Date.now() / 1000);
  const exp = typeof payload.exp === "number" ? payload.exp : 0;
  const iat = typeof payload.iat === "number" ? payload.iat : 0;
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (payload.aud !== projectId) throw new AppError("google_invalid_token", 401);
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new AppError("google_invalid_token", 401);
  if (!exp || exp <= now) throw new AppError("google_invalid_token", 401);
  if (!iat || iat > now + 120) throw new AppError("google_invalid_token", 401);
  if (!sub || sub.length > 128) throw new AppError("google_invalid_token", 401);

  const certs = await certificates(fetchImpl);
  const certificate = certs[kid];
  if (!certificate) throw new AppError("google_invalid_token", 401);
  let verified = false;
  try {
    const key = createPublicKey(certificate);
    verified = verifySignature("RSA-SHA256", Buffer.from(`${encodedHeader}.${encodedPayload}`), key, Buffer.from(encodedSignature, "base64url"));
  } catch { verified = false; }
  if (!verified) throw new AppError("google_invalid_token", 401);

  const firebase = payload.firebase as { sign_in_provider?: string; identities?: Record<string, unknown> } | undefined;
  const provider = firebase?.sign_in_provider ?? "";
  // Only federated Google identities are accepted; anonymous and custom tokens are refused.
  if (provider !== "google.com") throw new AppError("google_unsupported_provider", 403);
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 320) throw new AppError("google_email_required", 400);
  const emailVerified = payload.email_verified === true;
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 120) : null;
  const picture = typeof payload.picture === "string" && /^https:\/\//.test(payload.picture) ? payload.picture.slice(0, 2048) : null;
  return { uid: sub, email, emailVerified, name: name && name.length >= 2 ? name : null, picture, signInProvider: provider };
}

/** Test hook: clears the cached Google certificates. */
export function resetGoogleCertificateCache() {
  cache = null;
}

export type { FirebaseCert };
