"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  LogIn,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth, authErrorKey } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const { t, dir } = useI18n();
  const { user, loading, signInEmail, signUpEmail, signInGoogle, sendReset } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSignup = mode === "signup";

  // already signed in (e.g. pressed "back" to this page): go straight to the app
  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [loading, user, router]);

  // 0–4 password strength: length, mixed case, digit, symbol
  const strength = useMemo(() => {
    let n = 0;
    if (password.length >= 8) n++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) n++;
    if (/\d/.test(password)) n++;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) n++;
    return password ? Math.max(1, n) : 0;
  }, [password]);

  const handleGoogle = async () => {
    setError(null);
    setBusy("google");
    try {
      await signInGoogle();
      router.replace("/app");
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setError(t.auth.errors[authErrorKey(code) as keyof typeof t.auth.errors]);
      setBusy(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy("form");
    try {
      if (isSignup) await signUpEmail(name, email.trim(), password);
      else await signInEmail(email.trim(), password);
      router.replace("/app");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(t.auth.errors[authErrorKey(code) as keyof typeof t.auth.errors]);
      setBusy(null);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) {
      setError(t.auth.errors.invalid);
      return;
    }
    try {
      await sendReset(email);
      setNotice(t.auth.resetSent);
      setError(null);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(t.auth.errors[authErrorKey(code) as keyof typeof t.auth.errors]);
    }
  };

  return (
    <div className="relative grid min-h-[var(--app-h,100dvh)] lg:grid-cols-2" dir={dir}>
      {/* brand panel */}
      <div className="lattice relative hidden overflow-hidden bg-brand-700 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="relative flex items-center justify-between">
          <Link href="/">
            <Logo size={40} />
          </Link>
          <LanguageSwitcher compact />
        </div>

        <div className="relative">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="text-5xl font-bold leading-tight text-white"
          >
            {t.auth.brandLine}
            .
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-4 max-w-md text-lg text-slate-300"
          >
            {t.auth.brandSub}
          </motion.p>
          <motion.ul
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.3 }}
            className="mt-8 space-y-3.5"
          >
            {t.auth.brandPoints.map((p) => (
              <li key={p} className="flex items-center gap-3 text-slate-200">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15">
                  <BadgeCheck className="h-4 w-4 text-white" />
                </span>
                <span className="font-bold">{p}</span>
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="relative flex items-center gap-2 text-sm font-bold text-slate-400"
        >
          <ShieldCheck className="h-4 w-4 text-emerald-300" />
          Firebase Auth • Google Security
        </motion.div>
      </div>

      {/* form panel */}
      <div className="relative flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between lg:hidden">
          <Link href="/">
            <Logo size={32} />
          </Link>
          <LanguageSwitcher compact />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Link
              href="/"
              className="mb-8 inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 transition hover:text-brand-300"
            >
              <ArrowLeft
                className={cn("h-4 w-4", dir === "ltr" && "rotate-180")}
              />
              {t.common.back}
            </Link>

            <h1 className="text-3xl font-black text-white sm:text-4xl">
              {isSignup ? t.auth.signupTitle : t.auth.loginTitle}
            </h1>
            <p className="mt-2.5 text-slate-400">
              {isSignup ? t.auth.signupSub : t.auth.loginSub}
            </p>

            <button
              type="button"
              onClick={handleGoogle}
              disabled={busy !== null}
              className="btn-ghost mt-8 w-full py-3.5 text-[15px]"
            >
              {busy === "google" ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <GoogleMark />
              )}
              {t.auth.google}
            </button>

            <div className="my-6 flex items-center gap-4">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-bold text-slate-500">
                {t.auth.or}
              </span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignup && (
                <div className="relative">
                  <User className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t.auth.name}
                    className="input-base ps-11"
                    autoComplete="name"
                  />
                </div>
              )}
              <div className="relative">
                <Mail className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.auth.email}
                  className="input-base ps-11"
                  dir="ltr"
                  autoComplete="email"
                />
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute start-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-500" />
                <input
                  type={showPass ? "text" : "password"}
                  required
                  minLength={isSignup ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.auth.password}
                  className="input-base ps-11 pe-11"
                  dir="ltr"
                  autoComplete={isSignup ? "new-password" : "current-password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((s) => !s)}
                  className="absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-300"
                  aria-label="show password"
                >
                  {showPass ? (
                    <EyeOff className="h-4.5 w-4.5" />
                  ) : (
                    <Eye className="h-4.5 w-4.5" />
                  )}
                </button>
              </div>
              {isSignup && (
                <div className="-mt-1 space-y-1.5">
                  <div className="flex gap-1.5" aria-hidden>
                    {[1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors duration-300",
                          i <= strength
                            ? strength <= 1
                              ? "bg-rose-400"
                              : strength === 2
                                ? "bg-amber-400"
                                : "bg-brand-400"
                            : "bg-white/10"
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">
                    {t.auth.passwordHint}
                    {password && (
                      <span className="ms-1.5 font-bold text-slate-300">
                        {strength <= 1 ? "· ضعيفة" : strength === 2 ? "· متوسطة" : strength === 3 ? "· قوية" : "· ممتازة"}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {!isSignup && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-sm font-bold text-brand-300 transition hover:text-brand-400"
                >
                  {t.auth.forgot}
                </button>
              )}

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300"
                >
                  {error}
                </motion.p>
              )}
              {notice && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300"
                >
                  {notice}
                </motion.p>
              )}

              <button
                type="submit"
                disabled={busy !== null}
                className="btn-primary w-full py-4 text-base"
              >
                {busy === "form" ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <LogIn className="h-5 w-5" />
                )}
                {isSignup ? t.auth.signupBtn : t.auth.loginBtn}
              </button>
            </form>

            <p className="mt-7 text-center text-sm text-slate-400">
              {isSignup ? t.auth.haveAccount : t.auth.noAccount}{" "}
              <Link
                href={isSignup ? "/login" : "/signup"}
                className="font-black text-brand-300 transition hover:text-brand-400"
              >
                {isSignup ? t.auth.loginBtn : t.auth.signupBtn}
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
