/**
 * NEXUS v19 — مركز الأمان (server-only)
 * ---------------------------------------------------------------------------
 * Real verification codes for sensitive actions:
 *   · a 6-digit code, stored ONLY as a SHA-256 hash, valid 10 minutes,
 *     maximum 5 attempts, one active code per user;
 *   · delivery by email through whichever provider is configured
 *     (Resend → Brevo → a generic JSON mail API). With no provider configured the
 *     route reports `delivery: "link"` and the UI falls back to Firebase's own
 *     verification email + Firebase phone OTP, so the feature still works;
 *   · a 15-minute "trusted" window after a successful verification;
 *   · a verified phone number and a 2FA preference (off · email · phone).
 *
 * Nothing here ever returns a code that was not minted in this process.
 */
import crypto from "node:crypto";
import { pool } from "@/db";
import { ensureSchema } from "@/db/ensure-schema";

export type CodeDelivery = "email" | "link" | "phone" | "none";
export type TwoFactor = "off" | "email" | "phone";

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_MAX_ATTEMPTS = 5;
export const TRUST_MS = 15 * 60_000;

const env = (k: string) => (process.env[k] ?? "").trim().replace(/^["']|["']$/g, "");
const hashOf = (uid: string, code: string) => crypto.createHash("sha256").update(`${uid}:${code}:nexus-v19`).digest("hex");

async function ready(): Promise<boolean> {
  try {
    await ensureSchema();
    return true;
  } catch {
    return false;
  }
}

export type SecurityView = {
  phone: string | null;
  phoneVerified: boolean;
  twoFactor: TwoFactor;
  codePending: boolean;
  codeExpiresIn: number;
  codeAttempts: number;
  trustedUntil: string | null;
  trusted: boolean;
  updatedAt: string | null;
};

export async function securityView(uid: string): Promise<SecurityView> {
  const empty: SecurityView = {
    phone: null,
    phoneVerified: false,
    twoFactor: "off",
    codePending: false,
    codeExpiresIn: 0,
    codeAttempts: 0,
    trustedUntil: null,
    trusted: false,
    updatedAt: null,
  };
  if (!(await ready())) return empty;
  try {
    const r = await pool.query(
      `select phone, phone_verified, two_factor, code_hash, code_expires_at, code_attempts, verified_at, updated_at
         from barq.security_state where user_id = $1 limit 1`,
      [uid]
    );
    const row = r.rows[0] as
      | {
          phone: string | null;
          phone_verified: boolean;
          two_factor: string;
          code_hash: string | null;
          code_expires_at: Date | string | null;
          code_attempts: number;
          verified_at: Date | string | null;
          updated_at: Date | string | null;
        }
      | undefined;
    if (!row) return empty;
    const exp = row.code_expires_at ? new Date(row.code_expires_at).getTime() : 0;
    const pending = Boolean(row.code_hash) && exp > Date.now();
    const verifiedAt = row.verified_at ? new Date(row.verified_at).getTime() : 0;
    return {
      phone: row.phone ?? null,
      phoneVerified: row.phone_verified === true,
      twoFactor: (["off", "email", "phone"].includes(row.two_factor) ? row.two_factor : "off") as TwoFactor,
      codePending: pending,
      codeExpiresIn: pending ? Math.max(0, Math.round((exp - Date.now()) / 1000)) : 0,
      codeAttempts: row.code_attempts ?? 0,
      trustedUntil: verifiedAt ? new Date(verifiedAt + TRUST_MS).toISOString() : null,
      trusted: Boolean(verifiedAt && Date.now() - verifiedAt < TRUST_MS),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    };
  } catch {
    return empty;
  }
}

export type MintResult =
  | { ok: true; delivery: CodeDelivery; expiresIn: number; masked: string; code?: string }
  | { ok: false; code: "NO_DB" | "TOO_MANY" | "NO_EMAIL"; detail: string };

/** Which email provider is configured right now. */
export function mailProvider(): "resend" | "brevo" | "custom" | "none" {
  if (env("RESEND_API_KEY")) return "resend";
  if (env("BREVO_API_KEY") || env("SENDINBLUE_API_KEY")) return "brevo";
  if (env("MAIL_API_URL")) return "custom";
  return "none";
}

const mask = (email: string) => {
  const [n, d] = email.split("@");
  if (!d) return email.slice(0, 2) + "•••";
  return `${(n ?? "").slice(0, 2)}•••@${d}`;
};

/** Creates a fresh 6-digit code for the user and tries to email it. */
export async function mintCode(uid: string, email: string): Promise<MintResult> {
  if (!(await ready())) return { ok: false, code: "NO_DB", detail: "قاعدة البيانات غير متوفرة — استعمل التحقق برابط Firebase" };
  if (!email || !email.includes("@")) return { ok: false, code: "NO_EMAIL", detail: "الحساب بلا بريد إلكتروني" };

  try {
    const prev = await pool.query(`select code_sent_at from barq.security_state where user_id = $1`, [uid]);
    const sentAt = prev.rows[0]?.code_sent_at ? new Date(prev.rows[0].code_sent_at as string).getTime() : 0;
    if (sentAt && Date.now() - sentAt < 45_000) {
      return { ok: false, code: "TOO_MANY", detail: `استنى ${Math.ceil((45_000 - (Date.now() - sentAt)) / 1000)} ثانية قبل رمز جديد` };
    }

    const code = String(crypto.randomInt(100_000, 1_000_000));
    const expires = new Date(Date.now() + CODE_TTL_MS);
    await pool.query(
      `insert into barq.security_state (user_id, code_hash, code_expires_at, code_sent_at, code_attempts, updated_at)
       values ($1,$2,$3,now(),0,now())
       on conflict (user_id) do update set
         code_hash = excluded.code_hash,
         code_expires_at = excluded.code_expires_at,
         code_sent_at = now(),
         code_attempts = 0,
         updated_at = now()`,
      [uid, hashOf(uid, code), expires]
    );

    const sent = await sendCodeEmail(email, code);
    return {
      ok: true,
      delivery: sent ? "email" : "link",
      expiresIn: Math.round(CODE_TTL_MS / 1000),
      masked: mask(email),
      // NEVER leak a live code in production. On a local/dev instance with no mail
      // provider the code is returned so the flow can still be tested end to end.
      code: !sent && process.env.NODE_ENV !== "production" ? code : undefined,
    };
  } catch (e) {
    return { ok: false, code: "NO_DB", detail: (e as Error).message?.slice(0, 120) ?? "خطأ في قاعدة البيانات" };
  }
}

export type VerifyResult = { ok: true; trustedUntil: string } | { ok: false; code: "NO_DB" | "NO_CODE" | "EXPIRED" | "WRONG" | "LOCKED"; detail: string; attemptsLeft?: number };

/** Checks a submitted code. Five wrong attempts burn it. */
export async function verifyCode(uid: string, submitted: string): Promise<VerifyResult> {
  if (!(await ready())) return { ok: false, code: "NO_DB", detail: "قاعدة البيانات غير متوفرة" };
  const code = String(submitted ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, code: "WRONG", detail: "الرمز ستة أرقام" };

  try {
    const r = await pool.query(
      `select code_hash, code_expires_at, code_attempts from barq.security_state where user_id = $1 limit 1`,
      [uid]
    );
    const row = r.rows[0] as { code_hash: string | null; code_expires_at: Date | string | null; code_attempts: number } | undefined;
    if (!row?.code_hash) return { ok: false, code: "NO_CODE", detail: "ما طلبتِش رمز — اضغط «أرسل الرمز»" };
    const exp = row.code_expires_at ? new Date(row.code_expires_at).getTime() : 0;
    if (exp < Date.now()) return { ok: false, code: "EXPIRED", detail: "الرمز انتهى (10 دقائق) — اطلب واحدًا جديدًا" };
    if ((row.code_attempts ?? 0) >= CODE_MAX_ATTEMPTS) {
      await pool.query(`update barq.security_state set code_hash = null, updated_at = now() where user_id = $1`, [uid]);
      return { ok: false, code: "LOCKED", detail: "محاولات كثيرة — اطلب رمزًا جديدًا" };
    }

    const ok = timingSafeEqual(hashOf(uid, code), row.code_hash);
    if (!ok) {
      const attempts = (row.code_attempts ?? 0) + 1;
      await pool.query(`update barq.security_state set code_attempts = $2, updated_at = now() where user_id = $1`, [uid, attempts]);
      return { ok: false, code: "WRONG", detail: "الرمز غالط", attemptsLeft: Math.max(0, CODE_MAX_ATTEMPTS - attempts) };
    }

    const until = new Date(Date.now() + TRUST_MS).toISOString();
    await pool.query(
      `update barq.security_state set code_hash = null, code_attempts = 0, verified_at = now(), updated_at = now() where user_id = $1`,
      [uid]
    );
    return { ok: true, trustedUntil: until };
  } catch (e) {
    return { ok: false, code: "NO_DB", detail: (e as Error).message?.slice(0, 120) ?? "خطأ" };
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** True when the user verified a code in the last 15 minutes. */
export async function isTrusted(uid: string): Promise<boolean> {
  const v = await securityView(uid);
  return v.trusted;
}

export async function revokeTrust(uid: string): Promise<boolean> {
  if (!(await ready())) return false;
  try {
    await pool.query(
      `insert into barq.security_state (user_id, verified_at, code_hash, updated_at) values ($1, null, null, now())
       on conflict (user_id) do update set verified_at = null, code_hash = null, code_attempts = 0, updated_at = now()`,
      [uid]
    );
    return true;
  } catch {
    return false;
  }
}

export async function savePhone(uid: string, phone: string, verified: boolean): Promise<boolean> {
  if (!(await ready())) return false;
  try {
    await pool.query(
      `insert into barq.security_state (user_id, phone, phone_verified, updated_at) values ($1,$2,$3,now())
       on conflict (user_id) do update set phone = excluded.phone, phone_verified = excluded.phone_verified, updated_at = now()`,
      [uid, phone.slice(0, 24), verified]
    );
    return true;
  } catch {
    return false;
  }
}

export async function setTwoFactor(uid: string, mode: TwoFactor): Promise<boolean> {
  if (!(await ready())) return false;
  try {
    await pool.query(
      `insert into barq.security_state (user_id, two_factor, updated_at) values ($1,$2,now())
       on conflict (user_id) do update set two_factor = excluded.two_factor, updated_at = now()`,
      [uid, mode]
    );
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * email delivery (any provider, no dependency)
 * ------------------------------------------------------------------ */
const MAIL_FROM = () => env("MAIL_FROM") || env("RESEND_FROM") || "Nexus AI <no-reply@nexus.local>";
const APP_NAME = "Nexus AI";

function emailHtml(code: string): string {
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#100f14;padding:28px;font-family:system-ui,'Segoe UI','Noto Sans Arabic',sans-serif">
<div style="max-width:460px;margin:0 auto;background:#1a1922;border:1px solid #ffffff14;border-radius:22px;padding:28px;color:#f4f3f7">
<div style="font-size:13px;color:#a5a2b3">رمز التحقق — ${APP_NAME}</div>
<div style="font-size:20px;font-weight:800;margin:10px 0 18px">هذا هو رمزك السري</div>
<div style="font-size:38px;font-weight:900;letter-spacing:10px;direction:ltr;text-align:center;background:#00000055;border-radius:16px;padding:18px;color:#f5c451">${code}</div>
<p style="font-size:13px;line-height:2;color:#a5a2b3;margin:18px 0 0">
الرمز صالح 10 دقائق فقط، ولا يعمل إلا مرة واحدة.<br>إذا ما طلبتيش هذا الرمز، تجاهل الرسالة — حسابك في أمان.
</p>
<div style="margin-top:22px;font-size:11px;color:#74716a">${APP_NAME} — من تطوير abdelrezakbezzag · الجزائر 🇩🇿</div>
</div></body></html>`;
}

/** Sends the code with the first provider that is configured. */
export async function sendCodeEmail(to: string, code: string): Promise<boolean> {
  const provider = mailProvider();
  if (provider === "none") return false;
  const subject = `${code} — رمز التحقق من ${APP_NAME}`;
  const text = `رمز التحقق: ${code}\nصالح 10 دقائق. إذا لم تطلبه، تجاهل هذه الرسالة.`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    if (provider === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: ctl.signal,
        headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: MAIL_FROM(), to: [to], subject, text, html: emailHtml(code) }),
      });
      return r.ok;
    }
    if (provider === "brevo") {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        signal: ctl.signal,
        headers: { "api-key": env("BREVO_API_KEY") || env("SENDINBLUE_API_KEY"), "Content-Type": "application/json" },
        body: JSON.stringify({ sender: { name: APP_NAME, email: MAIL_FROM().replace(/^.*<|>$/g, "") }, to: [{ email: to }], subject, textContent: text, htmlContent: emailHtml(code) }),
      });
      return r.ok;
    }
    // generic JSON mail API: POST {to, subject, text, html}
    const r = await fetch(env("MAIL_API_URL"), {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", ...(env("MAIL_API_KEY") ? { Authorization: `Bearer ${env("MAIL_API_KEY")}` } : {}) },
      body: JSON.stringify({ to, from: MAIL_FROM(), subject, text, html: emailHtml(code) }),
    });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
