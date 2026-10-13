"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { NexusMark } from "@/components/logo";
import { PrimaryButton, GhostButton } from "@/components/ui";

const ERRORS: Record<string, string> = {
  "auth/invalid-credential": "البريد أو كلمة السر غير صحيحة.",
  "auth/user-not-found": "لا يوجد حساب بهذا البريد.",
  "auth/wrong-password": "كلمة السر غير صحيحة.",
  "auth/email-already-in-use": "هذا البريد مسجّل من قبل — سجّل الدخول.",
  "auth/weak-password": "كلمة السر ضعيفة (6 أحرف على الأقل).",
  "auth/invalid-email": "صيغة البريد غير صحيحة.",
  "auth/popup-closed-by-user": "تم إغلاق نافذة Google.",
  "auth/network-request-failed": "تحقّق من اتصال الإنترنت.",
  "auth/too-many-requests": "محاولات كثيرة — انتظر قليلًا.",
};

/** Shows the app only for signed-in users; everyone else sees the login card. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { user, ready, signInGoogle, signInEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [create, setCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!ready)
    return (
      <div className="grid h-dvh place-items-center">
        <Loader2 className="size-6 animate-spin text-(--accent)" />
      </div>
    );
  if (user) return <>{children}</>;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setError(ERRORS[code] ?? "تعذّر تسجيل الدخول. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => signInEmail(email.trim(), password, create));
  };

  return (
    <div className="grid h-dvh place-items-center px-4">
      <div className="glass-2 hairline w-full max-w-sm rounded-3xl p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <NexusMark />
          <h1 className="text-lg font-extrabold">{create ? "إنشاء حساب Nexus" : "مرحبًا بعودتك"}</h1>
          <p className="text-[12px] text-(--ink-3)">سجّل الدخول لحفظ محادثاتك وتفعيل Pro — تجربة مجانية 7 أيام.</p>
        </div>
        <GhostButton className="w-full" disabled={busy} onClick={() => void run(signInGoogle)}>
          المتابعة مع Google
        </GhostButton>
        <div className="my-3 text-center text-[11px] text-(--ink-3)">أو بالبريد</div>
        <form onSubmit={submit} className="flex flex-col gap-2.5" dir="ltr">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className="glass rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-(--accent)/40"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={create ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="glass rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-(--accent)/40"
          />
          <PrimaryButton type="submit" loading={busy}>
            {create ? "إنشاء الحساب" : "دخول"}
          </PrimaryButton>
        </form>
        {error && <p className="mt-3 text-center text-[12px] text-red-400">{error}</p>}
        <button
          onClick={() => setCreate((v) => !v)}
          className="mt-4 w-full cursor-pointer text-center text-[12px] text-(--accent) hover:underline"
        >
          {create ? "لدي حساب — تسجيل الدخول" : "ليس لدي حساب — إنشاء حساب"}
        </button>
      </div>
    </div>
  );
}
