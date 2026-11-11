import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppError } from "@/lib/server/errors";
import { appOrigin } from "@/lib/env";

export type SessionUser = { id: string; displayName: string; role: "buyer" | "seller" | "admin" | "support"; locale: "ar" | "en" | "fr"; emailVerified: boolean; preferences: { offers: boolean; listings: boolean; push: boolean } };
const COOKIE = "dz_session";
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const result = await getDb().execute(sql`select * from resolve_session(${hashToken(token)})`);
  const row = result.rows[0] as { id: string; display_name: string; role: SessionUser["role"]; locale: string; email_verified_at: Date | null; preferences: SessionUser["preferences"] } | undefined;
  if (!row) return null;
  return { id: row.id, displayName: row.display_name, role: row.role, locale: ["ar", "en", "fr"].includes(row.locale) ? row.locale as SessionUser["locale"] : "fr", emailVerified: Boolean(row.email_verified_at), preferences: row.preferences };
}
export async function requireActor(): Promise<SessionUser> {
  const actor = await getSession(); if (!actor) throw new AppError("auth_required", 401); return actor;
}
export async function issueSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getDb().execute(sql`select create_session(${hashToken(token)}, ${userId}::uuid, 604800)`);
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 604800 });
  return token;
}
export async function revokeSession(): Promise<void> {
  const store = await cookies(); const token = store.get(COOKIE)?.value;
  if (token) await getDb().execute(sql`select revoke_session(${hashToken(token)})`);
  store.delete(COOKIE);
}
export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  let allowed = false;
  try {
    const source = new URL(origin ?? "");
    allowed = source.origin === new URL(appOrigin()).origin;
    // Arena's development reverse proxy uses a per-sandbox HTTPS origin.
    // Never trust arbitrary forwarded hosts, and never enable this in production.
    const host = request.headers.get("host")?.split(",")[0].trim();
    if (process.env.NODE_ENV === "development" && host && /^[a-z0-9-]+\.e2b\.app$/i.test(host.split(":")[0]) && source.protocol === "https:" && source.host === host) allowed = true;
  } catch { /* fail closed */ }
  if (!allowed || fetchSite === "cross-site") throw new AppError("csrf_failed", 403);
}
