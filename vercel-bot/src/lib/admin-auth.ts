import { createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "mediators_admin";

function token() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return "";
  return createHmac("sha256", password).update("mediators-dashboard-session").digest("hex");
}

export function authorized(request: Request) {
  const expected = token();
  if (!expected) return false;
  const cookie = request.headers.get("cookie") || "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1) || "";
  if (!value || value.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export function verifyPassword(candidate: unknown) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (typeof candidate !== "string" || !expected || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

export function sessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token()}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure}`;
}
