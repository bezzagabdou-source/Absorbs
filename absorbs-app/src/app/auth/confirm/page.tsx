"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Email-confirmation landing: verifies token_hash / code from Supabase emails. */
export default function AuthConfirmPage() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    const code = params.get("code");
    const supabase = createClient();

    (async () => {
      try {
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as "signup" | "recovery" | "email",
          });
          setState(error ? "error" : "ok");
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          setState(error ? "error" : "ok");
        } else {
          // Hash-based implicit flow is handled by supabase-js automatically.
          const { data } = await supabase.auth.getSession();
          setState(data.session ? "ok" : "error");
        }
      } catch {
        setState("error");
      }
    })();
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md items-center px-4 py-10">
      <div className="glass w-full rounded-[28px] p-8 text-center">
        {state === "loading" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-emerald-600" />
            <h1 className="mt-4 text-xl font-black text-slate-900">جارٍ تفعيل حسابك…</h1>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="mt-4 text-2xl font-black text-slate-900">تم تفعيل حسابك بنجاح</h1>
            <p className="mt-2 text-sm leading-7 text-slate-900/60">
              افتح تطبيق <b>Dz connect</b> على هاتفك وسجّل الدخول ببريدك وكلمة المرور — أو تابع من المتصفح.
            </p>
            <Link href="/login" className="btn-primary mt-6 inline-flex w-full items-center justify-center rounded-full py-3.5 font-black text-slate-900">
              تسجيل الدخول
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-2xl font-black text-slate-900">الرابط غير صالح أو منتهٍ</h1>
            <p className="mt-2 text-sm leading-7 text-slate-900/60">
              اطلب رابط تفعيل جديدًا من شاشة تسجيل الدخول في التطبيق عبر «إعادة إرسال رابط التفعيل».
            </p>
            <Link href="/login" className="btn-primary mt-6 inline-flex w-full items-center justify-center rounded-full py-3.5 font-black text-slate-900">
              الذهاب لتسجيل الدخول
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
