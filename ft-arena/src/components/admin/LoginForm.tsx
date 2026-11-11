"use client";
import { useState } from "react";
import Brand from "./Brand";

export default function LoginForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "تعذّر الدخول");
        setBusy(false);
        return;
      }
      location.reload();
    } catch {
      setError("خطأ في الشبكة — أعد المحاولة");
      setBusy(false);
    }
  }

  return (
    <div className="landing-hero" style={{ padding: "24px 14px" }}>
      <form onSubmit={submit} className="card login-card" style={{ width: "min(420px, 100%)", padding: 30 }}>
        <div className="center" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
            <Brand size={62} />
          </div>
          <h1 style={{ fontSize: 26 }}>مسابقات MX</h1>
          <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
            لوحة التحكم الشاملة — أدخل كلمة المرور للمتابعة
          </p>
        </div>

        <label className="label">كلمة المرور</label>
        <input
          className="input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          autoFocus
          autoComplete="current-password"
          style={{ marginBottom: 14 }}
        />
        {error && (
          <div className="badge badge-red" style={{ marginBottom: 12, padding: "7px 12px", width: "100%" }}>
            ⚠️ {error}
          </div>
        )}
        <button className="btn btn-primary btn-lg" style={{ width: "100%" }} disabled={busy || password.length < 1}>
          {busy ? <span className="spinner" /> : "دخول اللوحة"}
        </button>
        <p className="muted-2 center" style={{ fontSize: 11, marginTop: 16, lineHeight: 1.9 }}>
          جلسة آمنة تنتهي تلقائيًا بعد 7 أيام.
        </p>
      </form>
    </div>
  );
}
