"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, CheckCircle2, Loader2, Mail, PartyPopper, UserRound, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, PasswordField, strengthOf } from "@/components/auth/auth-shell";
import { SITE_URL } from "@/lib/supabase/config";
import { cn, friendlyError, isValidUsername, normalizeUsername } from "@/lib/utils";

type UsernameState = "idle" | "checking" | "free" | "taken" | "invalid";

export default function SignupPage() {
  useEffect(() => {
    try {
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("dz-ref", ref);
    } catch {}
  }, []);

  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameState, setUsernameState] = useState<UsernameState>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* live username availability check (debounced) */
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    if (!username) return setUsernameState("idle");
    if (!isValidUsername(username)) return setUsernameState("invalid");
    setUsernameState("checking");
    checkTimer.current = setTimeout(async () => {
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
      setUsernameState(data ? "taken" : "free");
    }, 450);
  }, [username]);

  const strength = strengthOf(password);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isValidUsername(username)) return setError("اسم المستخدم: 3–20 حرفًا (أحرف إنجليزية صغيرة وأرقام و . و _)");
    if (usernameState === "taken") return setError("اسم المستخدم هذا محجوز، اختر اسمًا آخر");
    if (password.length < 8) return setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${SITE_URL}/feed`,
        data: { username, display_name: displayName.trim() },
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(friendlyError(signUpError, "تعذّر إنشاء الحساب"));
      return;
    }
    // If email confirmation is enabled in Supabase, there is no session yet.
    if (!data.session) {
      setNeedsConfirmation(true);
      return;
    }
    router.replace("/feed");
    router.refresh();
  };

  if (needsConfirmation) {
    return (
      <AuthShell title="حسابك على وشك الجاهزية 🎉" subtitle="" footer={null}>
        <div className="flex flex-col items-center py-4 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-300/30">
            <PartyPopper className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-lg font-black text-white">فعّل حسابك من بريدك الإلكتروني</h2>
          <p className="mt-2 text-sm leading-7 text-white/60">
            أرسلنا رابط تأكيد إلى <span className="font-bold text-white" dir="ltr">{email}</span>
            <br />
            اضغط الرابط وستدخل مباشرة إلى عالم Dz connect باسم{" "}
            <span className="font-bold text-teal-200" dir="ltr">@{username}</span>
          </p>
          <Link href="/login" className="btn-primary mt-6 rounded-full px-6 py-3 text-sm font-bold text-white">
            الذهاب لتسجيل الدخول
          </Link>
          <p className="mt-4 text-[11px] leading-5 text-white/35">
            لم يصلك البريد؟ تحقق من مجلد الرسائل غير المرغوب فيها (Spam)، أو عطّل «Confirm email» من إعدادات Supabase Auth للتجربة الفورية.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="انضم إلى Dz connect ✨"
      subtitle="حساب واحد يفتح لك المنشورات الحيّة والرسائل الخاصة لحظة بلحظة."
      footer={
        <>
          لديك حساب مسبقًا؟{" "}
          <Link href="/login" className="font-bold text-teal-200 hover:underline">
            تسجيل الدخول
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-white/70">الاسم الظاهر</span>
          <span className="relative block">
            <UserRound className="pointer-events-none absolute start-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/35" />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
              autoComplete="name"
              placeholder="مثال: أمين بن يوسف"
              className="input-glass w-full rounded-2xl py-3 ps-11 pe-4 text-[15px] text-white"
              required
            />
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-white/70">اسم المستخدم (للرسائل والبحث)</span>
          <span className="relative block">
            <AtSign className="pointer-events-none absolute start-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/35" />
            <input
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              autoComplete="username"
              placeholder="username"
              dir="ltr"
              style={{ textAlign: "left" }}
              className="input-glass w-full rounded-2xl py-3 ps-11 pe-11 text-[15px] text-white"
              required
            />
            <span className="absolute end-3 top-1/2 -translate-y-1/2">
              {usernameState === "checking" && <Loader2 className="h-4.5 w-4.5 animate-spin text-white/40" />}
              {usernameState === "free" && <CheckCircle2 className="h-4.5 w-4.5 text-emerald-300" />}
              {(usernameState === "taken" || usernameState === "invalid") && <XCircle className="h-4.5 w-4.5 text-red-300" />}
            </span>
          </span>
          <span
            className={cn(
              "mt-1.5 block text-[11.5px]",
              usernameState === "free" && "text-emerald-300",
              usernameState === "taken" && "text-red-300",
              usernameState === "invalid" && "text-red-300",
              (usernameState === "idle" || usernameState === "checking") && "text-white/35",
            )}
          >
            {usernameState === "free" && "اسم متاح — رائع!"}
            {usernameState === "taken" && "هذا الاسم محجوز، جرّب غيره"}
            {usernameState === "invalid" && "3–20 حرفًا: أحرف إنجليزية صغيرة وأرقام ونقطة وشرطة سفلية"}
            {(usernameState === "idle" || usernameState === "checking") && "سيظهر للناس هكذا: @username ويراسلونك به"}
          </span>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-[13px] font-semibold text-white/70">البريد الإلكتروني</span>
          <span className="relative block">
            <Mail className="pointer-events-none absolute start-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-white/35" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              dir="ltr"
              style={{ textAlign: "left" }}
              className="input-glass w-full rounded-2xl py-3 ps-11 pe-4 text-[15px] text-white"
              required
            />
          </span>
        </label>

        <div>
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" label="كلمة المرور (8+ أحرف)" />
          {password.length > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div className={cn("h-full rounded-full transition-all duration-500", strength.color)} style={{ width: `${((strength.score + 1) / 6) * 100}%` }} />
              </div>
              <span className="text-[11px] font-semibold text-white/50">{strength.label}</span>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="animate-fade-up rounded-2xl bg-red-500/12 px-4 py-3 text-sm leading-6 text-red-200 ring-1 ring-red-400/25">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || usernameState === "taken"} className="btn-primary flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-black text-white">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "إنشاء حسابي مجانًا"}
        </button>
      </form>
    </AuthShell>
  );
}
