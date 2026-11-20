import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, gt, and } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions } from "@/db/schema";
import type { NextRequest } from "next/server";

export function initialAdminPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error("Set ADMIN_PASSWORD before initializing the store");
  return password;
}
export const SESSION_COOKIE = "asil_admin_session";

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession() {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 12);
  await db.insert(adminSessions).values({ tokenHash: hashToken(token), expiresAt });
  return { token, expiresAt };
}

export async function authenticated(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [session] = await db.select({ tokenHash: adminSessions.tokenHash }).from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, hashToken(token)), gt(adminSessions.expiresAt, new Date()))).limit(1);
  return !!session;
}
