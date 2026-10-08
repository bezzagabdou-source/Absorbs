"use client";

/**
 * Nexus AI v14 — Security.
 * Real in-app password change + email verification, in the grouped-card layout.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface Login {
  kind: string;
  provider: string;
  createdAt: string;
  userAgent?: string;
}

/** 0..4 */
function strength(p: string): number {
  let n = 0;
  if (p.length >= 8) n++;
  if (p.length >= 12) n++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) n++;
  if (/\d/.test(p)) n++;
  if (/[^\w\s]/.test(p)) n++;
  return Math.min(4, n);
}
const BARS = ["ضعيفة جدًا", "ضعيفة", "مقبولة", "قوية", "قوية جدًا"];
const TONES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"];

export default function SecurityPage() {
  const { user, sendVerification, refreshVerified, sendReset, changePassword, authFetch } = useAuth();

  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // derived, not an effect: avoids the cascading-render lint error
  const [justVerified, setJustVerified] = useState(false);
  const verified = Boolean(user?.emailVerified) || justVerified;
  const [logins, setLogins] = useState<Login[]>([]);

  const emailUser = user?.providerData?.[0]?.providerId === "password";

  useEffect(() => {
    let dead = false;
    void authFetch("/api/user/security")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { logins?: Login[] } | null) => {
        if (!dead && j?.logins) setLogins(j.logins.slice(0, 5));
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
  }, [authFetch]);

  const run = useCallback(async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusy(id);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "وقع خطأ." });
    } finally {
      setBusy("");
    }
  }, []);

  const s = strength(next);
  const canSubmit = cur.length > 0 && next.length >= 8 && next === again && !busy;

  return (
    <div className="v12-page v12-grain mx-auto w-full max-w-2xl px-4 pb-12 pt-5 sm:px-6">
      <div className="v12-sky" />

      <header className="v12-in mb-6">
        <h1 className="v12-display text-[clamp(26px,5vw,38px)]">الأمان</h1>
        <p className="mt-1.5 text-[14px] text-[var(--v12-dim)]">
          بريدك، كلمة السر، وآخر الدخولات على حسابك.
        </p>
      </header>

      {msg && (
        <div
          className={cn(
            "v12-card v12-in mb-4 flex items-start gap-2.5 px-4 py-3 text-[13.5px]",
            msg.kind === "ok"
              ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200"
              : "border-red-400/35 bg-red-500/10 text-red-200"
          )}
        >
          {msg.kind === "ok" ? (
            <Check className="mt-0.5 h-4 w-4 flex-none" />
          ) : (
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          )}
          {msg.text}
        </div>
      )}

      {/* ---- email ---- */}
      <h2 className="v12-group-title">البريد الإلكتروني</h2>
      <div className="v12-group v12-in mb-6">
        <div className="v12-row">
          <Mail className="v12-row-ico" />
          <span className="v12-row-label">
            {user?.email ?? "—"}
            <span className="v12-row-sub">
              {verified ? "مفعّل ومؤكَّد" : "ماشي مفعّل — الرمز ما وصلش؟ عاود الإرسال"}
            </span>
          </span>
          {verified ? (
            <BadgeCheck className="h-5 w-5 flex-none text-emerald-400" />
          ) : (
            <span className="v12-chip flex-none !text-[10px]">بانتظار</span>
          )}
        </div>

        {!verified && (
          <>
            <button
              type="button"
              disabled={busy === "send"}
              onClick={() =>
                void run("send", () => sendVerification(), "أرسلنا رابط التفعيل لبريدك ✉️ شوف صندوق الوارد و«السبام».")
              }
              className="v12-row w-full"
            >
              <ShieldCheck className="v12-row-ico" />
              <span className="v12-row-label">
                أرسل رابط التفعيل
                <span className="v12-row-sub">يوصل فـ ثوانٍ — تأكّد من مجلّد السبام</span>
              </span>
              {busy === "send" && <Loader2 className="h-4 w-4 flex-none animate-spin" />}
            </button>
            <button
              type="button"
              disabled={busy === "chk"}
              onClick={() =>
                void run(
                  "chk",
                  async () => {
                    const ok = await refreshVerified();
                    setJustVerified(ok);
                    if (!ok) throw new Error("مازال ماشي مفعّل. حلّ الرابط فالبريد وعاود.");
                  },
                  "تفعّل الحساب ✅"
                )
              }
              className="v12-row w-full"
            >
              <Check className="v12-row-ico" />
              <span className="v12-row-label">
                فعّلت؟ تحقّق دابا
                <span className="v12-row-sub">نعاودو نقراو الحالة من الخادم</span>
              </span>
              {busy === "chk" && <Loader2 className="h-4 w-4 flex-none animate-spin" />}
            </button>
          </>
        )}
      </div>

      {/* ---- password ---- */}
      <h2 className="v12-group-title">كلمة السر</h2>
      {emailUser ? (
        <form
          className="v12-card v12-in mb-6 space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            void run(
              "pw",
              async () => {
                await changePassword(cur, next);
                setCur("");
                setNext("");
                setAgain("");
              },
              "تبدّلت كلمة السر ✅"
            );
          }}
        >
          {[
            { v: cur, set: setCur, ph: "كلمة السر الحالية", auto: "current-password" },
            { v: next, set: setNext, ph: "الجديدة (8 حروف على الأقل)", auto: "new-password" },
            { v: again, set: setAgain, ph: "أعد الجديدة", auto: "new-password" },
          ].map((f, i) => (
            <div key={i} className="relative">
              <input
                type={show ? "text" : "password"}
                value={f.v}
                autoComplete={f.auto}
                onChange={(e) => f.set(e.target.value)}
                placeholder={f.ph}
                className="w-full rounded-xl border border-[var(--v12-line)] bg-[var(--v12-card-2)] px-3.5 py-3 pe-10 text-[14.5px] text-[var(--v12-text)] outline-none transition placeholder:text-[var(--v12-faint)] focus:border-[var(--v12-accent)]"
              />
              {i === 0 && (
                <button
                  type="button"
                  onClick={() => setShow((x) => !x)}
                  className="absolute inset-y-0 end-3 grid place-items-center text-[var(--v12-faint)]"
                  aria-label="إظهار"
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              )}
            </div>
          ))}

          {next.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className="h-1 flex-1 rounded-full transition-colors"
                    style={{ background: i < s ? TONES[s] : "rgba(255,255,255,.1)" }}
                  />
                ))}
              </div>
              <p className="text-[11.5px]" style={{ color: TONES[s] }}>
                {BARS[s]}
                {again.length > 0 && next !== again && (
                  <span className="text-red-300"> · الجديدتان ما متطابقتينش</span>
                )}
              </p>
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className="v12-btn v12-btn-primary w-full !py-3 disabled:opacity-40">
            {busy === "pw" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            بدّل كلمة السر
          </button>

          <button
            type="button"
            disabled={busy === "rst" || !user?.email}
            onClick={() => void run("rst", () => sendReset(user?.email ?? ""), "أرسلنا رابط إعادة التعيين ✉️")}
            className="w-full text-center text-[12.5px] text-[var(--v12-faint)] underline-offset-4 hover:text-[var(--v12-text)] hover:underline"
          >
            نسيت الحالية؟ ابعث ليا رابط
          </button>
        </form>
      ) : (
        <div className="v12-group v12-in mb-6">
          <div className="v12-row">
            <KeyRound className="v12-row-ico" />
            <span className="v12-row-label">
              دخلت بحساب Google
              <span className="v12-row-sub">كلمة السر تتسيّر من طرف Google</span>
            </span>
          </div>
        </div>
      )}

      {/* ---- sessions ---- */}
      {logins.length > 0 && (
        <>
          <h2 className="v12-group-title">آخر الدخولات</h2>
          <div className="v12-group v12-in">
            {logins.map((l, i) => (
              <div key={i} className="v12-row">
                <MonitorSmartphone className="v12-row-ico" />
                <span className="v12-row-label">
                  {l.provider === "google" ? "Google" : "البريد"} · {l.kind === "signup" ? "تسجيل" : "دخول"}
                  <span className="v12-row-sub">
                    {new Date(l.createdAt).toLocaleString("ar-DZ")}
                    {l.userAgent ? ` · ${l.userAgent.slice(0, 40)}` : ""}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
