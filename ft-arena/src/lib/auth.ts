/**
 * مصادقة لوحة التحكم — جلسة موقّعة HMAC (بدون مكتبات) + توقيع آمن.
 * كل الأسرار تأتي من متغيرات البيئة.
 */
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { env } from "./env";

export const COOKIE = "ft_admin";
const TTL_MS = 7 * 86400_000;

const b64u = (b: Buffer) => b.toString("base64url");
const hmac = (data: string) => crypto.createHmac("sha256", env.authSecret).update(data).digest();

export function signSession(payload: { u: string; exp: number }): string {
  const body = b64u(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64u(hmac(body))}`;
}

export function verifySession(token?: string | null): { u: string; exp: number } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  try {
    const expected = b64u(hmac(body));
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as { u: string; exp: number };
    if (!payload?.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return Boolean(verifySession(jar.get(COOKIE)?.value));
}

export function checkPassword(input: string): boolean {
  const expected = env.adminPassword;
  if (!expected) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // مقارنة وهمية لتقليل فروق التوقيت
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function newSession(user = "admin"): { token: string; maxAge: number } {
  const token = signSession({ u: user, exp: Date.now() + TTL_MS });
  return { token, maxAge: Math.floor(TTL_MS / 1000) };
}

export function passwordReady(): boolean {
  return Boolean(env.adminPassword);
}
