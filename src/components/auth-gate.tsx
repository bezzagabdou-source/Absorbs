"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { Check, Eye, EyeOff, Loader2, Lock, Mail, Phone, ShieldCheck, User as UserIcon } from "lucide-react";
import { passwordStrength } from "@/lib/auth-local";
import { useAuth } from "@/lib/auth-context";
import { NexusMark } from "@/components/logo";
import { cn } from "@/lib/utils";

const COUNTRIES = ["DZ", "MA", "TN", "FR", "BE", "NL", "DE", "SA", "AE", "EG", "JO", "LB", "OTHER"];

const STRENGTH_LABEL = ["ضعيفة جدًا", "ضعيفة", "جيدة", "قوية"];
const STRENGTH_COLOR = ["bg-red-500", "bg-amber-500", "bg-lime-500", "bg-emerald-500"];

type Mode = "login" | "signup";

function fieldError(mode: Mode, field: string | undefined, reason?: string): string | null {
  if (!field) return null;
  const map: Record<string, string> = {
    name: "اكتب الاسم الكامل (حرفان على الأقل).",
    email: "صيغة البريد الإلكتروني غير صحيحة.",
    phone: "رقم الهاتف غير صحيح (7 أرقام على الأقل).",
    country: "اختر الدولة.",
    terms: "يجب قبول شروط الاستخدام.",
    password:
      reason === "min8"
        ? "كلمة السر قصيرة — 8 أحرف على الأقل."
        : reason === "max128"
          ? "كلمة السر طويلة جدًا (128 حد أقصى)."
          : "اكتب حرفًا واحدًا ورقمًا واحدًا على الأقل.",
  };
  void mode;
  return map[field] ?? "دخول البيانات غير صحيح.";
}

/**
 * The only gate before the app.
 *   • "حساب Nexus" — local account: full profile (name, email, phone, country)
 *     + strong password + terms. Fast, offline, secure (scrypt + HttpOnly session).
 *   • "Google" — OAuth via Firebase (popup).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready, signInLocal, signUpLocal, signInGoogle } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [method, setMethod] = useState<"nexus" | "google">("nexus");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("DZ");
  const [password, setPassword] = useState("");
  const [terms, setTerms] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);

  if (!ready)
    return (
      <div className="grid h-dvh place-items-center">
        <Loader2 className="size-6 animate-spin text-(--accent)" />
      </div>
    );
  if (user) return <>{children}</>;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      const retryAfter = (e as { retryAfter?: number }).retryAfter;
      const map: Record<string, string> = {
        BAD_CREDENTIALS: "البريد أو كلمة السر غير صحيحة.",
        LOCKED: retryAfter ? `الحساب مقفل مؤقتًا بعد محاولات فاشلة — حاول بعد ${Math.ceil(retryAfter / 60)} دقيقة.` : "الحساب مقفل مؤقتًا — حاول لاحقًا.",
        EMAIL_TAKEN: "هذا البريد مسجّل من قبل — سجّل الدخول.",
        RATE: "محاولات كثيرة — انتظر قليلًا ثم أعد المحاولة.",
        UNAUTHENTICATED: "سجّل الدخول أولًا.",
      };
      setError(map[code] ?? "تعذّر تنفيذ العملية. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  const validateLocal = (): string | null => {
    if (!email.trim() || !/^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(email.trim())) return fieldError(mode, "email");
    if (mode === "login") return password ? null : fieldError(mode, "password", "min8");
    // signup
    if (name.trim().length < 2) return fieldError(mode, "name");
    if (phone.trim() && !/^\+?[0-9][0-9\s\-()]{6,18}$/.test(phone.trim())) return fieldError(mode, "phone");
    if (password.length < 8 || !/[a-zA-Z\u0600-\u06FF]/.test(password) || !/\d/.test(password)) return fieldError(mode, "password", "need-letters-digits");
    if (!terms) return fieldError(mode, "terms");
    return null;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = validateLocal();
    if (v) {
      setError(v);
      return;
    }
    if (mode === "login") {
      void run(() => signInLocal(email.trim(), password));
    } else {
      void run(() =>
        signUpLocal({ name: name.trim(), email: email.trim(), phone: phone.trim(), country, password })
      );
    }
  };

  const inputCls =
    "glass w-full rounded-2xl py-2.5 pl-10 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-(--accent)/40 placeholder:text-(--ink-3)";

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="glass-2 hairline w-full max-w-md rounded-3xl p-6 sm:p-7"
      >
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <NexusMark size={56} />
          <h1 className="mt-1 text-xl font-extrabold tracking-tight">
            {method === "google" ? "المتابعة مع Google" : mode === "signup" ? "إنشاء حساب Nexus" : "مرحبًا بعودتك"}
          </h1>
          <p className="text-[12px] text-(--ink-3)">
            {mode === "signup" ? "حسابك الكامل: الاسم، البريد، الهاتف، والدولة — مع تجربة مجانية 7 أيام." : "سجّل الدخول لحفظ محادثاتك وإدارة خطتك."}
          </p>
        </div>

        {/* method tabs */}
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-(--glass-hi) p-1">
          {(
            [
              ["nexus", "حساب Nexus"],
              ["google", "Google"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMethod(m);
                setError(null);
              }}
              className={cn(
                "press rounded-xl py-2 text-[13px] font-bold transition",
                method === m ? "bg-(--accent) text-white shadow" : "text-(--ink-2) hover:text-(--ink)"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {method === "google" ? (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(signInGoogle)}
              className="glass hover-lift press flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-bold text-(--ink) transition"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                </svg>
              )}
              المتابعة مع حساب Google
            </button>
            <p className="text-center text-[11px] text-(--ink-3)">نافذة منبثقة لتسجيل الدخول بأمان عبر Google.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2.5" dir="ltr">
            {mode === "signup" && (
              <div className="relative">
                <UserIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-(--ink-3)" />
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="الاسم الكامل"
                  className={inputCls}
                  dir="rtl"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-(--ink-3)" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                className={inputCls}
              />
            </div>
            {mode === "signup" && (
              <>
                <div className="relative">
                  <Phone className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-(--ink-3)" />
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="الهاتف (اختياري) — مثال: 0550 12 34 56"
                    className={inputCls}
                    dir="rtl"
                  />
                </div>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-(--ink-3)" />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={cn(inputCls, "appearance-none cursor-pointer")}
                    aria-label="الدولة"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c} className="bg-(--panel-solid) text-(--ink)">
                        {c === "DZ" ? "الجزائر 🇩🇿" : c === "OTHER" ? "دولة أخرى" : c}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="relative">
              <Lock className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-(--ink-3)" />
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "كلمة سر قوية (8+ أحرف، حرف ورقم)" : "كلمة السر"}
                className={cn(inputCls, "pe-10")}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "إخفاء كلمة السر" : "إظهار كلمة السر"}
                className="absolute end-3 top-1/2 -translate-y-1/2 cursor-pointer text-(--ink-3) hover:text-(--ink)"
              >
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>

            {mode === "signup" && password.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex flex-1 gap-1">
                  {[1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn("h-1 flex-1 rounded-full transition-colors", strength >= i ? STRENGTH_COLOR[strength] : "bg-(--glass-hi)")}
                    />
                  ))}
                </div>
                <span className="text-[10.5px] font-semibold text-(--ink-3)">{STRENGTH_LABEL[strength]}</span>
              </div>
            )}

            {mode === "signup" && (
              <label className="flex cursor-pointer items-start gap-2 px-1 text-[11.5px] leading-relaxed text-(--ink-2)" dir="rtl">
                <span
                  role="checkbox"
                  aria-checked={terms}
                  tabIndex={0}
                  onClick={(e) => {
                    e.preventDefault();
                    setTerms((v) => !v);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && setTerms((v) => !v)}
                  className={cn(
                    "mt-0.5 grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-md border transition",
                    terms ? "border-(--accent) bg-(--accent) text-white" : "border-(--line-2) bg-transparent"
                  )}
                >
                  {terms && <Check className="size-3" strokeWidth={3.5} />}
                </span>
                <span>
                  أوافق على <span className="font-bold text-(--accent)">شروط الاستخدام</span> وسياسة الخصوصية — بياناتي محفوظة بشكل مشفّر ولا تُشارك مع أي طرف ثالث.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={busy}
              className="btn-primary press mt-1 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              {mode === "signup" ? "إنشاء الحساب" : "دخول"}
            </button>
          </form>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-center text-[12px] font-semibold text-red-400" dir="rtl">
            {error}
          </p>
        )}

        {method === "nexus" && (
          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === "login" ? "signup" : "login"));
              setError(null);
            }}
            className="mt-4 w-full cursor-pointer text-center text-[12px] text-(--accent) hover:underline"
            dir="rtl"
          >
            {mode === "login" ? "ليس لديك حساب؟ أنشئ حسابًا جديدًا" : "لديك حساب؟ سجّل الدخول"}
          </button>
        )}

        {method === "nexus" && (
          <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-(--line) pt-3 text-[10.5px] text-(--ink-3)" dir="rtl">
            <Lock className="size-3" />
            كلمات السر مخزّنة بـ scrypt — الجلسة HttpOnly — حماية من القوة الغاشمة
          </div>
        )}
      </motion.div>
    </div>
  );
}
