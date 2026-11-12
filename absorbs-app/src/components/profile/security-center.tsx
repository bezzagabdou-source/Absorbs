"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, CheckCircle2, KeyRound, Loader2, MonitorSmartphone, ShieldCheck, ShieldPlus, ShieldX } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { friendlyError } from "@/lib/utils";
import type { Profile } from "@/lib/types";

interface TotpFactor {
  id: string;
  status: string;
  friendly_name?: string;
}

/** Security center: password change, MFA (TOTP), global sign-out, blocked users. */
export function SecurityCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [signingOutAll, setSigningOutAll] = useState(false);

  const [factor, setFactor] = useState<TotpFactor | null>(null);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [blocked, setBlocked] = useState<Profile[]>([]);
  const [blocksAvailable, setBlocksAvailable] = useState(true);

  useEffect(() => {
    if (!open || !user) return;
    supabase.auth.mfa.listFactors().then(({ data }: { data: { totp: TotpFactor[] } | null }) => {
      setFactor(data?.totp?.find((f) => f.status === "verified") ?? data?.totp?.[0] ?? null);
      setMfaLoading(false);
    });
    supabase
      .from("blocks")
      .select("blocked:profiles!blocks_blocked_id_fkey ( id, username, display_name, avatar_url )")
      .eq("blocker_id", user.id)
      .then(({ data, error }: { data: Array<{ blocked: Profile | null }> | null; error: unknown }) => {
        if (error) return setBlocksAvailable(false);
        setBlocked((data ?? []).map((r) => r.blocked).filter((b): b is Profile => Boolean(b)));
      });
  }, [open, supabase, user]);

  const changePassword = async () => {
    if (newPassword.length < 8) return toast("كلمة المرور الجديدة: 8 أحرف على الأقل", "error");
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) return toast(friendlyError(error, "تعذّر تغيير كلمة المرور"), "error");
    setNewPassword("");
    toast("تم تغيير كلمة المرور بنجاح 🔐");
  };

  const signOutAll = async () => {
    setSigningOutAll(true);
    await supabase.auth.signOut({ scope: "global" });
    window.location.href = "/login";
  };

  const startEnroll = async () => {
    setMfaLoading(true);
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Dz connect" });
    setMfaLoading(false);
    if (error || !data) return toast("تعذّر بدء تفعيل التحقق بخطوتين", "error");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };

  const verifyEnroll = async () => {
    if (!enroll || code.trim().length < 6) return;
    setVerifying(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
    if (challenge.error || !challenge.data) {
      setVerifying(false);
      return toast("تعذّر إنشاء تحدّي التحقق", "error");
    }
    const verify = await supabase.auth.mfa.verify({ factorId: enroll.id, challengeId: challenge.data.id, code: code.trim() });
    setVerifying(false);
    if (verify.error) return toast("الكود غير صحيح — تأكد من تطبيق المصادقة وحاول مجددًا", "error");
    setEnroll(null);
    setCode("");
    setFactor({ id: enroll.id, status: "verified" });
    toast("تم تفعيل التحقق بخطوتين بنجاح 🛡️");
  };

  const disableMfa = async () => {
    if (!factor) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) return toast("تعذّر إيقاف التحقق بخطوتين", "error");
    setFactor(null);
    toast("تم إيقاف التحقق بخطوتين");
  };

  const unblock = async (target: Profile) => {
    if (!user) return;
    const { error } = await supabase.from("blocks").delete().eq("blocker_id", user.id).eq("blocked_id", target.id);
    if (!error) {
      setBlocked((prev) => prev.filter((b) => b.id !== target.id));
      toast(`تم إلغاء حظر ${target.display_name}`);
    }
  };

  if (!user) return null;

  return (
    <section className="glass animate-fade-up rounded-[28px] p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-start" aria-expanded={open}>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/15 text-emerald-300">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block font-bold text-white">الحماية والأمان</span>
          <span className="block text-xs text-white/45">كلمة المرور · التحقق بخطوتين · الجلسات · الحظر</span>
        </span>
        <span className={`text-white/40 transition-transform duration-300 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="animate-fade-up mt-4 space-y-5 border-t border-white/[0.07] pt-4">
          {/* password */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <KeyRound className="h-4 w-4 text-emerald-300" /> تغيير كلمة المرور
            </h3>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="كلمة مرور جديدة (8+)"
                autoComplete="new-password"
                dir="ltr"
                style={{ textAlign: "left" }}
                className="input-glass min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-sm text-white"
              />
              <button onClick={() => void changePassword()} disabled={savingPassword || newPassword.length < 8} className="btn-primary shrink-0 rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </button>
            </div>
          </div>

          {/* MFA */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <ShieldPlus className="h-4 w-4 text-emerald-300" /> التحقق بخطوتين (2FA)
            </h3>
            {mfaLoading ? (
              <p className="mt-2 flex items-center gap-2 text-xs text-white/40">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ التحقق…
              </p>
            ) : factor?.status === "verified" ? (
              <div className="mt-2 flex items-center justify-between rounded-2xl bg-emerald-400/10 px-3.5 py-3 ring-1 ring-emerald-300/25">
                <span className="flex items-center gap-2 text-sm font-bold text-emerald-200">
                  <CheckCircle2 className="h-4 w-4" /> مفعّل — حسابك محمي
                </span>
                <button onClick={() => void disableMfa()} className="flex items-center gap-1 text-xs font-bold text-red-300">
                  <ShieldX className="h-3.5 w-3.5" /> إيقاف
                </button>
              </div>
            ) : enroll ? (
              <div className="mt-2 space-y-3 rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/[0.07]">
                <p className="text-xs leading-5 text-white/60">امسح الرمز بتطبيق مصادقة (Google Authenticator / Authy) ثم أدخل الكود:</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enroll.qr} alt="QR التحقق بخطوتين" className="mx-auto h-40 w-40 rounded-2xl bg-white p-2" />
                <p className="break-all text-center text-[10px] text-white/35" dir="ltr">{enroll.secret}</p>
                <div className="flex gap-2">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    inputMode="numeric"
                    dir="ltr"
                    style={{ textAlign: "center", letterSpacing: "0.4em" }}
                    className="input-glass min-w-0 flex-1 rounded-2xl px-4 py-2.5 text-sm font-bold text-white"
                  />
                  <button onClick={() => void verifyEnroll()} disabled={verifying || code.length < 6} className="btn-primary shrink-0 rounded-full px-4 py-2.5 text-sm font-bold text-white disabled:opacity-40">
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "تفعيل"}
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => void startEnroll()} className="mt-2 rounded-full bg-white/[0.06] px-4 py-2.5 text-sm font-bold text-white ring-1 ring-white/10 transition hover:bg-white/10">
                تفعيل التحقق بخطوتين
              </button>
            )}
          </div>

          {/* sessions */}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <MonitorSmartphone className="h-4 w-4 text-emerald-300" /> الجلسات والأجهزة
            </h3>
            <p className="mt-1.5 text-xs leading-5 text-white/45">
              مسجّل كـ <span dir="ltr" className="text-white/70">{user.email}</span>
              {user.last_sign_in_at && <> · آخر دخول {new Date(user.last_sign_in_at).toLocaleString("ar-DZ")}</>}
            </p>
            <button
              onClick={() => void signOutAll()}
              disabled={signingOutAll}
              className="mt-2 rounded-full bg-red-500/12 px-4 py-2.5 text-sm font-bold text-red-200 ring-1 ring-red-400/25 transition hover:bg-red-500/20"
            >
              {signingOutAll ? "جارٍ الخروج…" : "تسجيل الخروج من كل الأجهزة"}
            </button>
          </div>

          {/* blocked users */}
          {blocksAvailable && (
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Ban className="h-4 w-4 text-emerald-300" /> المستخدمون المحظورون
              </h3>
              {blocked.length === 0 ? (
                <p className="mt-1.5 text-xs text-white/40">لا أحد محظور — يمكنك حظر أي مستخدم من صفحته الشخصية.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {blocked.map((b) => (
                    <li key={b.id} className="flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-3 py-2">
                      <Avatar profile={b} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{b.display_name}</span>
                      <button onClick={() => void unblock(b)} className="text-xs font-bold text-emerald-300">
                        إلغاء الحظر
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
