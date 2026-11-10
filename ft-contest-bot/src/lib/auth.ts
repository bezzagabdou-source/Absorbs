import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAppSecret } from "./settings";
import { getStore } from "./store";

const CRED_KEY = "admin:credential";
const COOKIE_NAME = "ft_admin";
const MAX_AGE = 60 * 60 * 24 * 7; // أسبوع

type Credential = { salt: string; hash: string; updatedAt: number };

function hash(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

/** كلمة مرور احتياطية من متغير البيئة (مفيدة قبل إضافة قاعدة بيانات) */
function envPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export async function hasAdminPassword(): Promise<boolean> {
  const cred = await getStore().get<Credential>(CRED_KEY);
  return Boolean(cred?.hash) || Boolean(envPassword());
}

export async function setAdminPassword(password: string): Promise<void> {
  if (password.length < 6) throw new Error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
  const salt = crypto.randomBytes(16).toString("hex");
  await getStore().set(CRED_KEY, {
    salt,
    hash: hash(password, salt),
    updatedAt: Date.now(),
  } satisfies Credential);
}

export async function verifyPassword(password: string): Promise<boolean> {
  // 🔑 كلمة سر البيئة (ADMIN_PASSWORD) مقبولة دائماً
  const env = envPassword();
  if (env && password.length === env.length) {
    try {
      if (crypto.timingSafeEqual(Buffer.from(password), Buffer.from(env))) return true;
    } catch {
      /* كمل للتحقق العادي */
    }
  }
  const cred = await getStore().get<Credential>(CRED_KEY);
  if (cred) {
    const candidate = Buffer.from(hash(password, cred.salt), "hex");
    const expected = Buffer.from(cred.hash, "hex");
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  }
  const fallback = envPassword();
  if (!fallback || password.length !== fallback.length) return false;
  return crypto.timingSafeEqual(Buffer.from(password), Buffer.from(fallback));
}

async function sign(value: string): Promise<string> {
  const secret = await getAppSecret();
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function createSession(): Promise<void> {
  const exp = Date.now() + MAX_AGE * 1000;
  const token = `${exp}.${await sign(String(exp))}`;
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!exp || !sig || Date.now() > exp) return false;
  const expected = await sign(expRaw);
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/admin/login");
}
