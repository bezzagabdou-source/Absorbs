"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPost, Btn, Input, Toaster, toast } from "@/components/ui";

export default function LoginPage(): React.ReactElement {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const [show, setShow] = useState(false);

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
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden p-4">
      <Toaster />
      <div className="aurora-blob" style={{ width: 420, height: 420, top: -120, right: -80, background: "rgba(16,185,129,.45)" }} />
      <div className="aurora-blob" style={{ width: 360, height: 360, bottom: -140, left: -60, background: "rgba(56,189,248,.4)", animationDelay: "2s" }} />
      <div className="aurora-blob" style={{ width: 260, height: 260, top: "40%", left: "58%", background: "rgba(244,114,182,.3)", animationDelay: "5s" }} />

      <div className="fade-in relative w-full max-w-md">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/catalog/logo.png"
            alt="CHINWI STORE"
            className="mx-auto h-24 w-24 rounded-3xl border-2 border-white/90 object-cover shadow-2xl shadow-emerald-600/30"
          />
          <h1 className="mt-4 text-3xl font-black gradient-text">CHINWI STORE</h1>
          <p className="mt-1 text-xs font-bold text-emerald-900/60">لوحة تحكم المالك — دخول آمن 🛡</p>
        </div>

        <form onSubmit={submit} className="glass-deep space-y-4 rounded-[28px] p-6">
          <div>
            <label className="label">كلمة سر لوحة التحكم</label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={checking}
                className="pe-12"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-sm text-emerald-900/50 hover:bg-white"
                tabIndex={-1}
              >
                {show ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          {error && (
            <p className="rounded-2xl border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600">⚠️ {error}</p>
          )}
          <Btn type="submit" disabled={busy || !password} className="w-full py-3 text-sm">
            {busy ? "جارٍ الدخول…" : "🔐 تسجيل الدخول"}
          </Btn>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {[
              { icon: "🧠", label: "AI" },
              { icon: "🛡", label: "حماية" },
              { icon: "📈", label: "تحليلات" },
            ].map((x) => (
              <div key={x.label} className="rounded-2xl bg-white/70 py-2 text-center">
                <p className="text-lg">{x.icon}</p>
                <p className="text-[0.62rem] font-black text-emerald-900/55">{x.label}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-[0.66rem] leading-5 text-emerald-900/45">
            الدخول محمي بـ scrypt + حدّ محاولات. يمكن تغيير كلمة السر من الإعدادات.
          </p>
        </form>

        <p className="mt-5 text-center text-[0.7rem] text-emerald-900/45">
          <a href="/" className="hover:text-emerald-600">
            ← رجوع إلى المتجر
          </a>
        </p>
      </div>
    </main>
  );
}
