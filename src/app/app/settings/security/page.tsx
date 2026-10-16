"use client";

/**
 * Nexus AI v14 — Security.
 * Real in-app password change + email verification, in the grouped-card layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Hash,
  Lock,
  Mail,
  MonitorSmartphone,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Timer,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ConfirmationResult } from "firebase/auth";
import { cn } from "@/lib/utils";

interface Login {
  kind: string;
  provider: string;
  createdAt: string;
  userAgent?: string;
}

/** 0..4 */
function strength(p: string): number {
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
  if (/\d/.test(p)) n++;
  if (/[^\w\s]/.test(p)) n++;
  return Math.min(4, n);
}
const BARS = ["ضعيفة جدًا", "ضعيفة", "مقبولة", "قوية", "قوية جدًا"];
const TONES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

export default function SecurityPage() {
  const {
    user,
    sendVerification,
    refreshVerified,
    sendReset,
    changePassword,
    authFetch,
    sendSecurityCode,
    verifySecurityCode,
    revokeSecurity,
    setTwoFactor,
    sendPhoneCode,
    confirmPhoneCode,
  } = useAuth();

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // derived, not an effect: avoids the cascading-render lint error
  const [justVerified, setJustVerified] = useState(false);
  const verified = Boolean(user?.emailVerified) || justVerified;
  const [logins, setLogins] = useState<Login[]>([]);

  /* ---- v19: verification code + phone OTP ---- */
  type Sec = {
    phone: string | null;
    phoneVerified: boolean;
    twoFactor: "off" | "email" | "phone";
    codePending: boolean;
    codeExpiresIn: number;
    trusted: boolean;
    trustedUntil: string | null;
  };
  const [sec, setSec] = useState<Sec | null>(null);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [cd, setCd] = useState(0);
  const [delivery, setDelivery] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [conf, setConf] = useState<ConfirmationResult | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const codeStr = useMemo(() => digits.join(""), [digits]);

  const emailUser = user?.providerData?.[0]?.providerId === "password";

  useEffect(() => {
    let dead = false;
    void authFetch("/api/user/security")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { logins?: Login[]; security?: Sec } | null) => {
        if (dead || !j) return;
        if (j.logins) setLogins(j.logins.slice(0, 5));
        if (j.security) {
          setSec(j.security);
          setCd(j.security.codeExpiresIn ?? 0);
        }
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [authFetch]);

  /* countdown for the pending code */
  const ticking = cd > 0;
  useEffect(() => {
    if (!ticking) return;
    const i = setInterval(() => setCd((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(i);
  }, [ticking]);

  const run = useCallback(async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "وقع خطأ." });
    } finally {
      setBusy("");
    }
  }, []);

  /** Sends a complete 6-digit code (called from the boxes, never from an effect). */
  const submitCode = useCallback(
    (value: string) => {
      if (!/^\d{6}$/.test(value) || busy === "code") return;
      void run(
        "code",
        async () => {
          const out = await verifySecurityCode(value);
          setSec((x) => (x ? { ...x, trusted: true, trustedUntil: out.trustedUntil, codePending: false } : x));
          setDigits(["", "", "", "", "", ""]);
        },
        "الرمز صحيح ✅ حسابك موثوق لمدة 15 دقيقة"
      );
    },
    [run, busy, verifySecurityCode]
  );

  const s = strength(next);
  const canSubmit = cur.length > 0 && next.length >= 8 && next === again && !busy;

  return (
    <div className="v12-page v12-grain mx-auto w-full max-w-2xl px-4 pb-12 pt-5 sm:px-6">
      <div className="v12-sky" />

      <header className="v12-in mb-6">
        <h1 className="v12-display text-[clamp(26px,5vw,38px)]">الأمان</h1>
        <p className="mt-1.5 text-[14px] text-[var(--v12-dim)]">
          بريدك، كلمة السر، رمز التحقق السري، رقم الهاتف برمز SMS، وآخر الدخولات على حسابك.
        </p>
      </header>

      {msg && (
        <div
          className={cn(
            "v12-card v12-in mb-4 flex items-start gap-2.5 px-4 py-3 text-[13.5px]",
            msg.kind === "ok"
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/35 bg-red-500/10 text-red-200"
          )}
        >
          {msg.kind === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 flex-none" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          )}
          {msg.text}
        </div>
      )}

      {/* ---- email ---- */}
      <h2 className="v12-group-title">البريد الإلكتروني</h2>
      <div className="v12-group v12-in mb-6">
        <div className="v12-row">
          <Mail className="v12-row-ico" />
          <span className="v12-row-label">
            {user?.email ?? "—"}
            <span className="v12-row-sub">
              {verified ? "مفعّل ومؤكَّد" : "ماشي مفعّل — الرمز ما وصلش؟ عاود الإرسال"}
            </span>
          </span>
          {verified ? (
            <BadgeCheck className="h-5 w-5 flex-none text-emerald-400" />
          ) : (
            <span className="v12-chip flex-none !text-[10px]">بانتظار</span>
          )}
        </div>

        {!verified && (
          <>
            <button
              type="button"
              disabled={busy === "send"}
              onClick={() =>
                void run("send", () => sendVerification(), "أرسلنا رابط التفعيل لبريدك ✉️ شوف صندوق الوارد و«السبام».")
              }
              className="v12-row w-full"
            >
              <ShieldCheck className="v12-row-ico" />
              <span className="v12-row-label">
                أرسل رابط التفعيل
                <span className="v12-row-sub">يوصل فـ ثوانٍ — تأكّد من مجلّد السبام</span>
              </span>
              {busy === "send" && <Loader2 className="h-4 w-4 flex-none animate-spin" />}
            </button>
            <button
              type="button"
              disabled={busy === "chk"}
              onClick={() =>
                void run(
                  "chk",
                  async () => {
                    const ok = await refreshVerified();
                    setJustVerified(ok);
                    if (!ok) throw new Error("مازال ماشي مفعّل. حلّ الرابط فالبريد وعاود.");
                  },
                  "تفعّل الحساب ✅"
                )
              }
              className="v12-row w-full"
            >
              <Check className="v12-row-ico" />
              <span className="v12-row-label">
                فعّلت؟ تحقّق دابا
                <span className="v12-row-sub">نعاودو نقراو الحالة من الخادم</span>
              </span>
              {busy === "chk" && <Loader2 className="h-4 w-4 flex-none animate-spin" />}
            </button>
          </>
        )}
      </div>

      {/* ---- v19: verification code ---- */}
      <h2 className="v12-group-title">رمز التحقق</h2>
      <div className="v12-card v12-in mb-6 space-y-3.5 p-4">
        <div className="flex items-start gap-2.5">
          <Hash className="mt-0.5 h-4 w-4 flex-none text-[var(--v12-accent)]" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-[var(--v12-text)]">رمز من 6 أرقام</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[var(--v12-dim)]">
              نرسل لك رمزًا سريًا صالحًا 10 دقائق. بعد التحقق يبقى الحساب <b>موثوقًا 15 دقيقة</b> للعمليات الحساسة
              (تغيير كلمة السر، ربط رقم، حذف بيانات).
            </p>
            {sec?.trusted && (
              <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" /> الجلسة موثوقة الآن
                {sec.trustedUntil && <span className="opacity-75">· حتى {new Date(sec.trustedUntil).toLocaleTimeString("ar-DZ")}</span>}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy === "mint" || cd > 0}
            onClick={() =>
              void run(
                "mint",
                async () => {
                  const out = await sendSecurityCode();
                  setCd(out.expiresIn || 600);
                  setDelivery(
                    out.delivery === "email"
                      ? `أُرسل الرمز إلى ${out.masked} ✉️`
                      : `ما كاينش مزوّد بريد — أرسلنا رابط تفعيل Firebase إلى ${out.masked}. ${out.code ? `رمز التجربة: ${out.code}` : ""}`
                  );
                  setSec((x) => (x ? { ...x, codePending: true, codeExpiresIn: out.expiresIn } : x));
                  setTimeout(() => boxes.current[0]?.focus(), 60);
                },
                delivery || "طلبنا رمزًا جديدًا"
              )
            }
            className="v12-btn v12-btn-primary !py-2.5"
          >
            {busy === "mint" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {cd > 0 ? "أرسلنا الرمز" : "أرسل الرمز"}
          </button>

          {cd > 0 && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--v12-faint)]">
              <Timer className="h-3.5 w-3.5" />
              {String(Math.floor(cd / 60)).padStart(2, "0")}:{String(cd % 60).padStart(2, "0")}
              {cd <= 45 ? " · تقدر تطلب رمزًا جديدًا" : ""}
            </span>
          )}
          {sec?.trusted && (
            <button
              type="button"
              className="v12-btn v12-btn-quiet !py-2"
              onClick={() =>
                void run(
                  "rev",
                  async () => {
                    await revokeSecurity();
                    setSec((x) => (x ? { ...x, trusted: false, trustedUntil: null } : x));
                  },
                  "أُلغيت الثقة — العمليات الحساسة تحتاج رمزًا جديدًا"
                )
              }
            >
              <ShieldAlert className="h-3.5 w-3.5" /> ألغِ الثقة
            </button>
          )}
        </div>

        {delivery && <p className="text-[12px] leading-relaxed text-[var(--v12-dim)]">{delivery}</p>}

        <div className="flex items-center gap-2" dir="ltr">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={d}
              aria-label={`الرقم ${i + 1}`}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, "").slice(-1);
                setDigits((prev) => {
                  const nextArr = [...prev];
                  nextArr[i] = v;
                  const joined = nextArr.join("");
                  if (i === 5 && /^\d{6}$/.test(joined)) submitCode(joined);
                  return nextArr;
                });
                if (v && i < 5) boxes.current[i + 1]?.focus();
              }}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) boxes.current[i - 1]?.focus();
                if (e.key === "ArrowLeft" && i < 5) boxes.current[i + 1]?.focus();
                if (e.key === "ArrowRight" && i > 0) boxes.current[i - 1]?.focus();
              }}
              onPaste={(e) => {
                const txt = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 6);
                if (!txt) return;
                e.preventDefault();
                setDigits(Array.from({ length: 6 }, (_, k) => txt[k] ?? ""));
                boxes.current[Math.min(5, txt.length)]?.focus();
                if (/^\d{6}$/.test(txt)) submitCode(txt);
              }}
              className="h-12 w-11 rounded-xl border border-[var(--v12-line)] bg-[var(--v12-card-2)] text-center text-[20px] font-black text-[var(--v12-text)] outline-none transition focus:border-[var(--v12-accent)] focus:shadow-[0_0_0_3px_rgba(217,119,87,.18)]"
            />
          ))}
          <button
            type="button"
            className="v12-btn v12-btn-primary ms-auto !py-2.5 disabled:opacity-40"
            disabled={codeStr.length !== 6 || busy === "code"}
            onClick={() => submitCode(codeStr)}
          >
            {busy === "code" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            تحقّق
          </button>
        </div>

        {/* ---- 2FA preference ---- */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--v12-line)] pt-3">
          <Lock className="h-3.5 w-3.5 text-[var(--v12-faint)]" />
          <span className="text-[12.5px] text-[var(--v12-dim)]">طريقة التحقق المفضّلة:</span>
          {(["off", "email", "phone"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setSec((x) => (x ? { ...x, twoFactor: m } : x));
                void setTwoFactor(m);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] font-bold transition",
                sec?.twoFactor === m
                  ? "border-transparent bg-[var(--v12-accent)] text-[#1b1206]"
                  : "border-[var(--v12-line)] text-[var(--v12-dim)] hover:text-[var(--v12-text)]"
              )}
            >
              {m === "off" ? "بلا" : m === "email" ? "البريد" : "الهاتف (SMS)"}
            </button>
          ))}
        </div>
      </div>

      {/* ---- v19: phone OTP (Firebase) ---- */}
      <h2 className="v12-group-title">رقم الهاتف — رمز عبر SMS</h2>
      <div className="v12-card v12-in mb-6 space-y-3 p-4">
        <div className="flex items-start gap-2.5">
          <Smartphone className="mt-0.5 h-4 w-4 flex-none text-[var(--v12-accent)]" />
          <p className="text-[12.5px] leading-relaxed text-[var(--v12-dim)]">
            ربط رقمك يعطيك رمزًا حقيقيًا عبر SMS من Firebase، ويخدم كطريقة استرجاع ثانية.
            <span className="mt-1 block text-[var(--v12-faint)]">
              الحالة: {sec?.phoneVerified ? "رقم مؤكد ✅" : sec?.phone ? `${sec.phone} (غير مؤكد)` : "ما كاينش رقم مربوط"}
            </span>
          </p>
        </div>

        {!otpSent ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+213555123456"
              className="min-w-[190px] flex-1 rounded-xl border border-[var(--v12-line)] bg-[var(--v12-card-2)] px-3.5 py-2.5 text-[14px] text-[var(--v12-text)] outline-none transition placeholder:text-[var(--v12-faint)] focus:border-[var(--v12-accent)]"
            />
            <button
              type="button"
              disabled={busy === "otp" || phone.replace(/\D/g, "").length < 9}
              onClick={() =>
                void run(
                  "otp",
                  async () => {
                    const out = await sendPhoneCode(phone, "nx-recaptcha");
                    setConf(out.confirmation);
                    setOtpSent(true);
                  },
                  "أرسلنا الرمز في SMS 📩"
                )
              }
              className="v12-btn v12-btn-primary !py-2.5 disabled:opacity-40"
            >
              {busy === "otp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
              أرسل رمز SMS
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              className="w-36 rounded-xl border border-[var(--v12-line)] bg-[var(--v12-card-2)] px-3.5 py-2.5 text-center text-[18px] font-black tracking-[6px] text-[var(--v12-text)] outline-none focus:border-[var(--v12-accent)]"
            />
            <button
              type="button"
              disabled={busy === "otp2" || otp.length !== 6}
              onClick={() =>
                void run(
                  "otp2",
                  async () => {
                    await confirmPhoneCode({ confirmation: conf ?? undefined, code: otp });
                    setOtp("");
                    setOtpSent(false);
                    setSec((x) => (x ? { ...x, phoneVerified: true, phone: phone || x.phone } : x));
                  },
                  "تأكد الرقم وربط بالحساب ✅"
                )
              }
              className="v12-btn v12-btn-primary !py-2.5 disabled:opacity-40"
            >
              {busy === "otp2" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              أكّد الرمز
            </button>
            <button
              type="button"
              className="v12-btn v12-btn-quiet !py-2"
              onClick={() => {
                setOtpSent(false);
                setOtp("");
                setConf(null);
              }}
            >
              إلغاء
            </button>
          </div>
        )}

        {/* invisible reCAPTCHA container required by Firebase phone auth */}
        <div id="nx-recaptcha" />
      </div>

      {/* ---- password ---- */}
      <h2 className="v12-group-title">كلمة السر</h2>
      {emailUser ? (
        <form
          className="v12-card v12-in mb-6 space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            void run(
              "pw",
              async () => {
                await changePassword(cur, next);
                setCur("");
                setNext("");
                setAgain("");
              },
              "تبدّلت كلمة السر ✅"
            );
          }}
        >
          {[
            { v: cur, set: setCur, ph: "كلمة السر الحالية", auto: "current-password" },
            { v: next, set: setNext, ph: "الجديدة (8 حروف على الأقل)", auto: "new-password" },
            { v: again, set: setAgain, ph: "أعد الجديدة", auto: "new-password" },
          ].map((f, i) => (
            <div key={i} className="relative">
              <input
                type={show ? "text" : "password"}
                value={f.v}
                autoComplete={f.auto}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.ph}
                className="w-full rounded-xl border border-[var(--v12-line)] bg-[var(--v12-card-2)] px-3.5 py-3 pe-10 text-[14.5px] text-[var(--v12-text)] outline-none transition placeholder:text-[var(--v12-faint)] focus:border-[var(--v12-accent)]"
              />
              {i === 0 && (
                <button
                  type="button"
                  onClick={() => setShow((x) => !x)}
                  className="absolute inset-y-0 end-3 grid place-items-center text-[var(--v12-faint)]"
                  aria-label="إظهار"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}

          {next.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{ background: i < s ? TONES[s] : "rgba(255,255,255,.1)" }}
                  />
                ))}
              </div>
              <p className="text-[11.5px]" style={{ color: TONES[s] }}>
                {BARS[s]}
                {again.length > 0 && next !== again && (
                  <span className="text-red-300"> · الجديدتان ما متطابقتينش</span>
                )}
              </p>
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className="v12-btn v12-btn-primary w-full !py-3 disabled:opacity-40">
            {busy === "pw" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            بدّل كلمة السر
          </button>

          <button
            type="button"
            disabled={busy === "rst" || !user?.email}
            onClick={() => void run("rst", () => sendReset(user?.email ?? ""), "أرسلنا رابط إعادة التعيين ✉️")}
            className="w-full text-center text-[12.5px] text-[var(--v12-faint)] underline-offset-4 hover:text-[var(--v12-text)] hover:underline"
          >
            نسيت الحالية؟ ابعث ليا رابط
          </button>
        </form>
      ) : (
        <div className="v12-group v12-in mb-6">
          <div className="v12-row">
            <KeyRound className="v12-row-ico" />
            <span className="v12-row-label">
              دخلت بحساب Google
              <span className="v12-row-sub">كلمة السر تتسيّر من طرف Google</span>
            </span>
          </div>
        </div>
      )}

      {/* ---- sessions ---- */}
      {logins.length > 0 && (
        <>
          <h2 className="v12-group-title">آخر الدخولات</h2>
          <div className="v12-group v12-in">
            {logins.map((l, i) => (
              <div key={i} className="v12-row">
                <MonitorSmartphone className="v12-row-ico" />
                <span className="v12-row-label">
                  {l.provider === "google" ? "Google" : "البريد"} · {l.kind === "signup" ? "تسجيل" : "دخول"}
                  <span className="v12-row-sub">
                    {new Date(l.createdAt).toLocaleString("ar-DZ")}
                    {l.userAgent ? ` · ${l.userAgent.slice(0, 40)}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
