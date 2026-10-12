/**
 * NEXUS v18 — one-time codes (server only).
 *
 * A 6-digit code is generated with a CSPRNG, hashed with SHA-256 + a server
 * pepper (the plain code is NEVER stored), and sent to the user's email.
 *
 *   • 6 digits, 10-minute life, 5 attempts, single use.
 *   • Resend is used when RESEND_API_KEY is set (plain fetch — no SDK).
 *   • With no mail provider configured the route replies `delivery: "preview"`
 *     and includes the code ONLY when OTP_PREVIEW=1 (local development).
 *     Production without a provider fails loudly instead of leaking codes.
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { otpCodes, users } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";

export type OtpPurpose = "verify_email" | "login" | "security";

const PEPPER = (process.env.OTP_PEPPER ?? process.env.ADMIN_SECRET ?? "nexus-atlas-pepper").trim();
const TTL_MS = 10 * 60_000;
const RESEND_COOLDOWN_MS = 60_000;

export const OTP_PURPOSES: readonly OtpPurpose[] = ["verify_email", "login", "security"];
export const isOtpPurpose = (v: unknown): v is OtpPurpose =>
  typeof v === "string" && (OTP_PURPOSES as readonly string[]).includes(v);

/** 6 digits, uniform, from a CSPRNG (never Math.random). */
export function makeCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashOf(email: string, code: string): string {
  return createHash("sha256").update(`${PEPPER}|${email.toLowerCase()}|${code}`).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** "s****@gmail.com" — enough to recognise the address, not enough to harvest it. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const head = name.slice(0, 1);
  const tail = name.length > 3 ? name.slice(-1) : "";
  return `${head}${"*".repeat(Math.max(2, Math.min(name.length - 1, 5)))}${tail}@${domain}`;
}

/* ───────────────────────────── mail transport ───────────────────────────── */

export type SendResult =
  | { ok: true; via: "resend" | "preview" }
  | { ok: false; error: string };

const AR = ` dir="rtl"`;

function mailHtml(code: string, purpose: OtpPurpose): string {
  const title =
    purpose === "login" ? "رمز الدخول" : purpose === "security" ? "رمز التحقق" : "رمز تفعيل الحساب";
  const body =
    purpose === "login"
      ? "استعمل هذا الرمز لتسجيل الدخول إلى حسابك. لا تشاركه مع أي شخص."
      : purpose === "security"
        ? "طلبت تغيير إعدادات الأمان. استعمل هذا الرمز للتأكيد."
        : "مرحباً بك في Nexus AI. أدخل هذا الرمز لتفعيل بريدك الإلكتروني.";
  return `<!doctype html><html lang="ar"${AR}><body style="margin:0;background:#0b0d14;font-family:system-ui,Segoe UI,Tahoma,sans-serif;color:#f4f6ff">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
  <div style="font-size:22px;font-weight:800;letter-spacing:.5px">NEXUS<span style="color:#f0b49f"> AI</span></div>
  <h1 style="font-size:19px;margin:18px 0 8px">${title}</h1>
  <p style="color:#9aa3c7;font-size:14px;line-height:1.7;margin:0 0 22px">${body}<br>صالح لمدة 10 دقائق، ومرة واحدة فقط.</p>
  <div style="background:#151a2b;border:1px solid #2a3450;border-radius:18px;padding:22px;text-align:center">
    <div style="font-size:40px;font-weight:900;letter-spacing:14px;font-variant-numeric:tabular-nums;color:#ffd7a8">${code}</div>
  </div>
  <p style="color:#6b7590;font-size:12px;margin-top:22px;line-height:1.7">إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة — لا يمكن لأحد الدخول بحسابك من دونه.</p>
</div></body></html>`;
}

/** Sends through Resend when configured; otherwise a gated local preview. */
export async function sendCode(email: string, code: string, purpose: OtpPurpose): Promise<SendResult> {
  const key = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.MAIL_FROM ?? "").trim() || "Nexus AI <onboarding@resend.dev>";
  const subject =
    purpose === "login" ? "رمز الدخول إلى Nexus AI" : purpose === "security" ? "رمز التحقق الأمني" : "رمز تفعيل حساب Nexus AI";

  if (!key) {
    // No provider: never leak a code in production, but keep local dev usable.
    if (process.env.OTP_PREVIEW === "1") return { ok: true, via: "preview" };
    return { ok: false, error: "MAIL_NOT_CONFIGURED" };
  }

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12_000);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject, html: mailHtml(code, purpose) }),
      signal: ctl.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 160);
      console.error("[otp] resend failed:", res.status, detail);
      return { ok: false, error: `MAIL_${res.status}` };
    }
    return { ok: true, via: "resend" };
  } catch (e) {
    console.error("[otp] send error:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "MAIL_ERROR" };
  }
}

/* ───────────────────────────── issue & verify ───────────────────────────── */

export type IssueResult =
  | { ok: true; sentTo: string; retryAfter: number; ttl: number; previewCode?: string }
  | { ok: false; code: "RATE" | "MAIL"; retryAfter?: number };

/** Creates, stores (hashed) and emails a fresh code. Invalidates older ones. */
export async function issueCode(o: {
  email: string;
  purpose: OtpPurpose;
  userId?: string | null;
  ip?: string;
}): Promise<IssueResult> {
  const email = o.email.trim().toLowerCase();
  const now = Date.now();

  // one code per minute per (email, purpose): kills both spam and abuse
  const recent = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, o.purpose)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  const lastAt = recent[0]?.createdAt ? new Date(recent[0].createdAt).getTime() : 0;
  if (lastAt && now - lastAt < RESEND_COOLDOWN_MS) {
    return { ok: false, code: "RATE", retryAfter: Math.ceil((RESEND_COOLDOWN_MS - (now - lastAt)) / 1000) };
  }

  const code = makeCode();
  const sent = await sendCode(email, code, o.purpose);
  if (!sent.ok) return { ok: false, code: "MAIL" };

  await db
    .update(otpCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(eq(otpCodes.email, email), eq(otpCodes.purpose, o.purpose), isNull(otpCodes.consumedAt))
    );
  await db.insert(otpCodes).values({
    email,
    userId: o.userId ?? null,
    purpose: o.purpose,
    codeHash: hashOf(email, code),
    expiresAt: new Date(now + TTL_MS),
    ip: (o.ip ?? "").slice(0, 64),
  });

  return {
    ok: true,
    sentTo: maskEmail(email),
    retryAfter: RESEND_COOLDOWN_MS / 1000,
    ttl: TTL_MS / 1000,
    ...(sent.via === "preview" ? { previewCode: code } : {}),
  };
}

export type VerifyResult =
  | { ok: true; email: string }
  | { ok: false; code: "NOT_FOUND" | "EXPIRED" | "USED" | "WRONG" | "LOCKED" };

/** Constant-time verify + single-use consumption. */
export async function verifyCode(o: {
  email: string;
  code: string;
  purpose: OtpPurpose;
  userId?: string | null;
}): Promise<VerifyResult> {
  const email = o.email.trim().toLowerCase();
  const code = o.code.replace(/\D/g, "").slice(0, 6);
  if (code.length !== 6) return { ok: false, code: "WRONG" };

  const rows = await db
    .select()
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        eq(otpCodes.purpose, o.purpose),
        isNull(otpCodes.consumedAt)
      )
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, code: "NOT_FOUND" };
  if (row.expiresAt && new Date(row.expiresAt).getTime() < Date.now()) {
    await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
    return { ok: false, code: "EXPIRED" };
  }
  if (row.attempts >= row.maxAttempts) return { ok: false, code: "LOCKED" };

  if (!safeEqual(row.codeHash, hashOf(email, code))) {
    await db
      .update(otpCodes)
      .set({ attempts: sql`${otpCodes.attempts} + 1` })
      .where(eq(otpCodes.id, row.id));
    return { ok: false, code: row.attempts + 1 >= row.maxAttempts ? "LOCKED" : "WRONG" };
  }

  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, row.id));
  return { ok: true, email };
}

/** Marks the email as verified in the profile (used after a successful check). */
export async function markEmailVerified(email: string): Promise<void> {
  await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email.trim().toLowerCase()));
}

/** Housekeeping: drop codes older than a day (cheap, runs opportunistically). */
export async function sweepCodes(): Promise<void> {
  await db.execute(sql`delete from barq.otp_codes where created_at < now() - interval '1 day'`);
}
