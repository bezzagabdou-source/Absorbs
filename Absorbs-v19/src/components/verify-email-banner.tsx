"use client";

import { useCallback, useEffect, useState } from "react";
import { MailCheck, Loader2, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

const COOLDOWN = 60;

/** Shown to password accounts whose e-mail is not verified yet: resend the Firebase e-mail, auto-detects verification. */
export function VerifyEmailBanner() {
  const { user, sendVerification, refreshVerified } = useAuth();
  const [hidden, setHidden] = useState(false);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [, force] = useState(0);

  const needs =
    !!user && !user.emailVerified && user.providerData.some((p) => p.providerId === "password");

  // while the banner is up, quietly check whether the user clicked the link in the e-mail
  useEffect(() => {
    if (!needs) return;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      refreshVerified()
        .then((ok) => ok && force((n) => n + 1))
        .catch(() => undefined);
    }, 6000);
    return () => clearInterval(id);
  }, [needs, refreshVerified]);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const resend = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      await sendVerification();
      setMsg("أرسلنا رسالة التفعيل إلى بريدك ✉️ (تفقّد أيضاً Spam)");
      setWait(COOLDOWN);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setMsg(code === "auth/too-many-requests" ? "طلبات كثيرة، انتظر قليلاً ثم أعد المحاولة." : "تعذّر الإرسال، حاول مرة أخرى.");
      setWait(COOLDOWN);
    }
    setBusy(false);
  }, [sendVerification]);

  const check = useCallback(async () => {
    setBusy(true);
    try {
      const ok = await refreshVerified();
      setMsg(ok ? "تم تفعيل بريدك ✓" : "لم يتم التفعيل بعد — افتح الرابط في رسالة البريد.");
      force((n) => n + 1);
    } catch {
      setMsg("تعذّر التحقق الآن.");
    }
    setBusy(false);
  }, [refreshVerified]);

  if (!needs || hidden) return null;
  return (
    <div role="status" className="relative mx-auto mt-2 flex w-[calc(100%-1.5rem)] max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-orange-400/40 bg-orange-500/10 px-3.5 py-2.5 text-[13px] font-bold text-slate-100">
      <MailCheck className="h-5 w-5 shrink-0 text-orange-600" />
      <span className="min-w-0 flex-1">{msg || "فعّل بريدك الإلكتروني لحماية حسابك واسترجاع كلمة المرور."}</span>
      <button type="button" onClick={resend} disabled={busy || wait > 0} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-gradient-to-l from-orange-500 to-amber-400 px-3 text-[12.5px] font-black text-[#fff] transition active:scale-95 disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {wait > 0 ? `أعد الإرسال (${wait})` : "أرسل رسالة التفعيل"}
      </button>
      <button type="button" onClick={check} disabled={busy} className="inline-flex h-9 items-center rounded-xl border border-orange-400/50 px-3 text-[12.5px] font-black transition active:scale-95">
        فعّلته
      </button>
      <button type="button" onClick={() => setHidden(true)} aria-label="إخفاء" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:text-slate-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
