import crypto from "crypto";

/**
 * Minimal Web Push sender (no dependency): VAPID (RFC 8292) + empty push.
 * The service worker shows the notification text itself, so no payload encryption is needed.
 * Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (both base64url, from scripts/gen-vapid.mjs), VAPID_SUBJECT.
 */

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function vapidPublicKey(): string {
  return (process.env.VAPID_PUBLIC_KEY ?? "").trim();
}

export function pushConfigured(): boolean {
  return vapidPublicKey().length > 40 && (process.env.VAPID_PRIVATE_KEY ?? "").trim().length > 20;
}

function signJwt(audience: string): string {
  const pub = Buffer.from(vapidPublicKey(), "base64url");
  const d = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const key = crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d },
    format: "jwk",
  });
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(
    JSON.stringify({
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: (process.env.VAPID_SUBJECT ?? "mailto:abdiubz0@gmail.com").trim(),
    })
  );
  const sig = crypto.sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64u(sig)}`;
}

/** Sends one empty push. Returns the HTTP status (404 / 410 = the subscription is dead). */
export async function sendPush(endpoint: string): Promise<number> {
  const url = new URL(endpoint);
  const jwt = signJwt(url.origin);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey()}`,
      TTL: "3300",
      Urgency: "normal",
      "Content-Length": "0",
    },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return res ? res.status : 0;
}
