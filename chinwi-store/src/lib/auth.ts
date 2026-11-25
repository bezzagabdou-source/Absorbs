import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "./env";
import { getSetting, setSetting } from "./db";

export const COOKIE_NAME = "chinwi_admin";
const SESSION_DAYS = 7;

function sign(payloadValue: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadValue).digest("hex");
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored) return false;
  if (!stored.startsWith("scrypt$")) return stored === password;
  const [, salt, key] = stored.split("$");
  if (!salt || !key) return false;
  const hash = scryptSync(password, salt, 64).toString("hex");
  try {
    return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(key, "hex"));
  } catch {
    return false;
  }
}

/** سجل كلمة السر: من الإعدادات إن وُجد وإلا نُنشئه من متغير البيئة */
export async function passwordRecord(): Promise<string> {
  const stored = await getSetting<string>("admin_password");
  if (typeof stored === "string" && stored.startsWith("scrypt$")) return stored;
  const record = hashPassword(env.adminPassword);
  await setSetting("admin_password", record);
  return record;
}

export async function checkPassword(password: string): Promise<boolean> {
  const record = await passwordRecord();
  if (verifyPassword(password, record)) return true;
  // يسمح بمتغير البيئة حتى لو كانت كلمة السر مخزّنة (مفيد عند إعادة الضبط)
  return password === env.adminPassword;
}

export async function changePassword(next: string): Promise<void> {
  await setSetting("admin_password", hashPassword(next));
}

export function createToken(): string {
  const exp = Date.now() + SESSION_DAYS * 86_400_000;
  const payloadValue = `v1.${exp}`;
  const sig = sign(payloadValue, env.adminSecret);
  return `${payloadValue}.${sig}`;
}

export function verifyToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  const [version, exp, sig] = parts;
  if (version !== "v1") return false;
  const expected = sign(`v1.${exp}`, env.adminSecret);
  if (sig.length !== expected.length) return false;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(exp) > Date.now();
}

export function cookieValue(): string {
  return createToken();
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_DAYS * 86_400,
};

/* ───────────────────────── حدّ المحاولات ───────────────────────── */

const attempts = new Map<string, { count: number; at: number }>();

export function tooManyAttempts(key: string): boolean {
  const rec = attempts.get(key);
  if (!rec) return false;
  if (Date.now() - rec.at > 10 * 60_000) {
    attempts.delete(key);
    return false;
  }
  return rec.count >= 8;
}

export function noteAttempt(key: string): void {
  const rec = attempts.get(key);
  if (!rec || Date.now() - rec.at > 10 * 60_000) {
    attempts.set(key, { count: 1, at: Date.now() });
    return;
  }
  rec.count += 1;
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}

export function clientKey(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "local"
  );
}
