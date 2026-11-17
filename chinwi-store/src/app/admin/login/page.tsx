"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, Btn, Input, Toaster, toast } from "@/components/ui";

export default function LoginPage(): React.ReactElement {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    apiGet("session")
      .then(() => {
        location.href = "/admin";
      })
      .catch(() => setChecking(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiPost("login", { password });
      toast("مرحباً بك 👑");
      location.href = "/admin";
    } catch (err) {
      setError((err as Error).message || "تعذّر الدخول");
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Toaster />
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-3xl font-black text-black shadow-2xl shadow-emerald-500/40">
            C
          </span>
          <h1 className="mt-4 text-2xl font-black text-white">CHINWI STORE</h1>
          <p className="mt-1 text-xs text-slate-400">لوحة تحكم المالك — دخول آمن</p>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div>
            <label className="label">كلمة سر لوحة التحكم</label>
            <Input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              disabled={checking}
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
              ⚠️ {error}
            </p>
          )}
          <Btn type="submit" disabled={busy || !password} className="w-full py-2.5">
            {busy ? "جارٍ الدخول…" : "🔐 تسجيل الدخول"}
          </Btn>
          <p className="text-center text-[0.68rem] leading-5 text-slate-500">
            كلمة السر تُخزَّن مشفّرة (scrypt) ويمكن تغييرها من الإعدادات بعد الدخول.
            <br />
            في حال نسيتها استخدم متغيّر البيئة <code>ADMIN_PASSWORD</code>.
          </p>
        </form>

        <p className="mt-5 text-center text-[0.7rem] text-slate-600">
          <a href="/" className="hover:text-emerald-400">
            ← رجوع إلى المتجر
          </a>
        </p>
      </div>
    </main>
  );
}
