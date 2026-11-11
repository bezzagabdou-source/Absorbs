"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, PasswordField } from "@/components/auth/auth-shell";
import { friendlyError } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (signInError) {
      setError(friendlyError(signInError, "تعذّر تسجيل الدخول"));
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/") ? next : "/feed");
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
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

      <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />

      {error && (
        <p role="alert" className="animate-fade-up rounded-2xl bg-rose-500/12 px-4 py-3 text-sm leading-6 text-rose-200 ring-1 ring-rose-400/25">
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className="btn-primary flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[15px] font-black text-white">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        تسجيل الدخول
      </button>

      <p className="text-center text-xs leading-5 text-white/40">
        نسيت كلمة المرور؟ من صفحة الدخول في Supabase يمكنك تفعيل إعادة التعيين عبر البريد — أو أنشئ حسابًا جديدًا أدناه.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <AuthShell
      title="أهلًا بعودتك 👋"
      subtitle="سجّل دخولك لمتابعة منشورات أصدقائك ورسائلك الخاصة لحظة بلحظة."
      footer={
        <>
          ليس لديك حساب؟{" "}
          <Link href="/signup" className="font-bold text-violet-300 hover:underline">
            أنشئ حسابًا مجانيًا
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
