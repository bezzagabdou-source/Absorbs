/**
 * Local account security primitives (server-side only).
 *
 *   • scrypt password hashing (N=16384, r=8, p=1, 64-byte key, per-user 16-byte salt)
 *   • opaque session tokens: 32 random bytes, stored ONLY as SHA-256 hashes
 *   • password policy + constant-time comparisons everywhere
 */
import crypto from "crypto";

export const SESSION_COOKIE = "nexus_session";
export const SESSION_DAYS = 30;

/* ------------------------------------------------------------------ hashing */

function scrypt(pw: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Returns `hash: salt` (both hex). */
export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(pw, salt);
  return `${key.toString("hex")}:${salt.toString("hex")}`;
}

/** Constant-time verify against a stored `hash:salt`. Never throws. */
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  try {
    const [hashHex, saltHex] = stored.split(":");
    if (!hashHex || !saltHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scrypt(pw, Buffer.from(saltHex, "hex"));
    if (expected.length !== actual.length) return false;
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Expensive dummy hash so unknown-email logins take the same time (no user enumeration by timing). */
export async function dummyHash(): Promise<void> {
  await scrypt("timing-equalizer-" + Math.random(), crypto.randomBytes(16)).catch(() => undefined);
}

/* ------------------------------------------------------------------ policy */

export function passwordError(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "min8";
  if (pw.length > 128) return "max128";
  if (!/[a-zA-Z\u0600-\u06FF]/.test(pw) || !/\d/.test(pw)) return "need-letters-digits";
  return null;
}

export function passwordStrength(pw: string): 0 | 1 | 2 | 3 {
  if (pw.length < 8) return 0;
  let score = 1;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++;
  return Math.min(3, score) as 0 | 1 | 2 | 3;
}

/* ------------------------------------------------------------------ tokens */

export function newSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function sha256hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/* ------------------------------------------------------------------ http */

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64) || "unknown";
  return (req.headers.get("x-real-ip") ?? "local").slice(0, 64);
}

function isSecure(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim();
  if (proto) return proto === "https";
  return process.env.NODE_ENV === "production";
}

export function sessionCookie(token: string, req: Request): string {
  const base = `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}`;
  return isSecure(req) ? `${base}; Secure` : base;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Reads the session cookie from a raw Request (no framework dependency). */
export function readSessionToken(req: Request): string {
  const cookie = req.headers.get("cookie") ?? "";
  const m = /(?:^|;\s*)nexus_session=([^;]+)/.exec(cookie);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return "";
  }
}
