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

/**
 * تطبيع كلمة المرور: يزيل المسافات الطرفية والمحارف الخفية (NBSP، ZWSP، BOM)
 * ويوحّد الشُرَط الأفقية والشرطة السفلية العربية — حتى لا تفشل كلمة صحيحة
 * بسبب نسخ/لصق أو لوحة مفاتيح عربية.
 */
function normalizePassword(v: string): string {
  return v
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u2060\uFEFF\u00A0]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** مقارنة ثابتة الزمن مع تطبيع كامل للطرفين */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // مقارنة وهمية لتقليل فروق التوقيت
    crypto.timingSafeEqual(bb, bb);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

export function checkPassword(input: string): boolean {
  const expected = env.adminPassword;
  if (!expected) return false;
  const given = normalizePassword(input);
  const want = normalizePassword(expected);
  if (!given) return false;
  // يطابق الأصل أو الشكل المُطبَّع (يدعم من يكتب الكلمة بأحرف عربية/سطر جديد)
  return safeEqual(given, want) || safeEqual(given, expected);
}

export function newSession(user = "admin"): { token: string; maxAge: number } {
  const token = signSession({ u: user, exp: Date.now() + TTL_MS });
  return { token, maxAge: Math.floor(TTL_MS / 1000) };
}

export function passwordReady(): boolean {
  return Boolean(env.adminPassword);
}
