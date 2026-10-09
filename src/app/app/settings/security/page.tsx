"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, LogOut, MailCheck, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Row, SettingsFrame } from "@/components/settings-ui";

type Data = {
  email: string;
  emailVerified: boolean;
  provider: string;
  logins: { kind: string; provider: string; device: string; at: string }[];
};

export default function SecurityPage() {
  const { authFetch, user, sendVerification, sendReset, signOut, refreshVerified } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch("/api/user/security");
      if (!r.ok) throw new Error(String(r.status));
      setData((await r.json()) as Data);
      setErr(false);
    } catch {
      setErr(true);
    }
  }, [authFetch]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(ok);
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      setMsg(code === "auth/too-many-requests" ? "طلبات كثيرة، انتظر قليلاً." : "تعذّر تنفيذ العملية.");
    }
    setBusy(false);
  };

  const when = (iso: string) => {
    try {
      return new Intl.DateTimeFormat("ar-DZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  const password = data?.provider !== "google";
  return (
    <SettingsFrame title="مركز الأمان">
      <Row
        icon={MailCheck}
        title={data?.emailVerified ? "البريد مفعّل ✓" : "البريد غير مفعّل"}
        desc={data?.email || user?.email || ""}
        action={
          !data?.emailVerified && password ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => sendVerification(), "أرسلنا رسالة التفعيل إلى بريدك ✉️")}
              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
            >
              إرسال التفعيل
            </button>
          ) : undefined
        }
      />
      {!data?.emailVerified && password && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(async () => { await refreshVerified(); await load(); }, "تم تحديث الحالة")}
          className="w-full rounded-2xl border border-orange-400/40 p-3 text-sm font-black text-slate-100 disabled:opacity-50"
        >
          فعّلته — حدّث الحالة
        </button>
      )}
      {password && (
        <button type="button" disabled={busy || !user?.email} onClick={() => run(() => sendReset(user?.email ?? ""), "أرسلنا رابط تغيير كلمة المرور إلى بريدك ✉️")} className="w-full text-start disabled:opacity-50">
          <Row icon={KeyRound} title="تغيير كلمة المرور" desc="نرسل رابطاً آمناً إلى بريدك عبر Firebase" />
        </button>
      )}
      <Row icon={ShieldCheck} title="حمايتك" desc="كلمات المرور لا تُخزَّن عندنا أبداً — Firebase يحفظ بصمة مشفّرة فقط، وقاعدة البيانات تحفظ بريدك وحالة تفعيله." />

      <h2 className="pt-2 text-sm font-black text-slate-300">آخر عمليات الدخول</h2>
      {!data && !err && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />}
      {err && <p className="text-center text-sm font-bold text-rose-500">تعذّر تحميل السجل.</p>}
      {data?.logins.length === 0 && <p className="text-center text-sm text-slate-400">لا يوجد سجل بعد.</p>}
      {data?.logins.map((l, i) => (
        <Row key={i} icon={MonitorSmartphone} title={`${l.kind === "signup" ? "إنشاء حساب" : "تسجيل دخول"} · ${l.provider === "google" ? "Google" : "بريد"}`} desc={`${l.device} · ${when(l.at)}`} />
      ))}

      <button type="button" onClick={() => signOut()} className="w-full text-start">
        <Row danger icon={LogOut} title="تسجيل الخروج" />
      </button>
      {msg && <p className="text-center text-sm font-bold text-brand-300">{msg}</p>}
    </SettingsFrame>
  );
}
