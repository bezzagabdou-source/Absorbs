"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { KeyRound, Loader2, Wand2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { AppShell } from "@/components/layout/app-shell";
import { useToast } from "@/components/ui/feedback";
import { createClient } from "@/lib/supabase/client";
import { isValidUsername, normalizeUsername } from "@/lib/utils";
import { useState } from "react";

/**
 * Protected app shell. Middleware already redirects guests server-side;
 * this client guard additionally handles the "profile row missing" case
 * (e.g. schema.sql was pasted AFTER the account was created).
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, profileMissing, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4">
        <span className="logo-mark h-16 w-16 animate-pulse rounded-[24px] text-2xl">A</span>
        <p className="flex items-center gap-2 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تجهيز عالمك…
        </p>
      </div>
    );
  }

  if (!user) return null;

  if (profileMissing && !profile) {
    return <ClaimUsername onDone={refreshProfile} />;
  }

  return <AppShell>{children}</AppShell>;
}

/** Self-healing screen: lets a signed-in user without a profile row claim a username. */
function ClaimUsername({ onDone }: { onDone: () => Promise<void> }) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidUsername(username)) return toast("اسم غير صالح: 3–20 حرفًا (a-z 0-9 . _)", "error");
    setBusy(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return setBusy(false);
    const { error } = await supabase.from("profiles").insert({
      id: user.id,
      username,
      display_name: displayName.trim() || username,
    });
    setBusy(false);
    if (error) {
      toast(error.message.includes("duplicate") ? "الاسم محجوز، اختر غيره" : "تعذّر الحفظ — تأكد من تنفيذ schema.sql", "error");
      return;
    }
    toast("أهلًا بك في Absorbs 🎉");
    await onDone();
  };

  return (
    <div className="aurora relative flex min-h-dvh items-center justify-center px-5">
      <form onSubmit={submit} className="glass animate-fade-up relative z-10 w-full max-w-sm rounded-[30px] p-6">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/20 text-violet-300">
          <Wand2 className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-black text-white">خطوة أخيرة: اختر هويتك</h1>
        <p className="mt-1.5 text-sm leading-6 text-white/55">حسابك موجود، لكن ملفك الشخصي لم يُنشأ بعد. اختر اسم مستخدم ليتمكن أصدقاؤك من مراسلتك.</p>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-[13px] font-semibold text-white/70">الاسم الظاهر</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input-glass w-full rounded-2xl px-4 py-3 text-[15px] text-white" placeholder="اسمك الكريم" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-white/70">
            <KeyRound className="h-3.5 w-3.5" /> اسم المستخدم
          </span>
          <input
            value={username}
            onChange={(e) => setUsername(normalizeUsername(e.target.value))}
            dir="ltr"
            style={{ textAlign: "left" }}
            className="input-glass w-full rounded-2xl px-4 py-3 text-[15px] text-white"
            placeholder="username"
            required
          />
        </label>
        <button disabled={busy} className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-black text-white">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ ودخول
        </button>

        <div className="mt-5 rounded-3xl bg-amber-400/10 p-4 ring-1 ring-amber-300/25">
          <p className="text-[13px] font-bold leading-6 text-amber-100">لو ظهرت رسالة «تعذّر الحفظ»: قاعدة البيانات تحتاج إعدادًا لمرة واحدة (دقيقتان)</p>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-[12px] leading-6 text-amber-100/70">
            <li>افتح زر «تنفيذ الإعداد» بالأسفل (حساب Supabase الخاص بالمشروع)</li>
            <li>الصق محتوى ملف FULL-SETUP.sql كاملًا واضغط Run</li>
            <li>ارجع هنا واضغط «حفظ ودخول» مرة أخرى — حسابك محفوظ ولن يضيع</li>
          </ol>
          <a
            href="https://supabase.com/dashboard/project/mcgnmjnzibjtjazcmwkd/sql/new"
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center justify-center gap-2 rounded-full bg-amber-400/20 py-2.5 text-sm font-black text-amber-100 ring-1 ring-amber-300/40 transition hover:bg-amber-400/30"
          >
            تنفيذ الإعداد في Supabase ↗
          </a>
        </div>
      </form>
    </div>
  );
}
