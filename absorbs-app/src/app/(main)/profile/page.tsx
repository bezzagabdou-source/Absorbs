"use client";

import { useRef, useState } from "react";
import { Camera, Check, Globe, Loader2, LogOut, Settings2, Trash2, UserRoundPen } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/providers/auth-provider";
import { ProfileView } from "@/components/profile/profile-view";
import { SecurityCenter } from "@/components/profile/security-center";
import { InstallButton } from "@/components/pwa/install-button";
import { useToast } from "@/components/ui/feedback";
import { Avatar } from "@/components/ui/avatar";
import { compressImage, friendlyError, isValidUsername, normalizeUsername } from "@/lib/utils";

export default function MyProfilePage() {
  const { profile } = useAuth();
  if (!profile) return null;
  return (
    <ProfileView profile={profile}>
      <SecurityCenter />
      <SettingsCard />
    </ProfileView>
  );
}

/* ─────────────── Account settings (edit profile, avatar, danger zone) ─────────────── */
function SettingsCard() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const { toast } = useToast();
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const avatarRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [username, setUsername] = useState(profile?.username ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [website, setWebsite] = useState(profile?.website ?? "");

  if (!profile || !user) return null;

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await compressImage(file, 512, 0.85);
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (updateError) throw updateError;
      await refreshProfile();
      toast("تم تحديث صورتك الشخصية 📸");
    } catch (err) {
      toast(friendlyError(err as { message?: string }, "تعذّر رفع الصورة"), "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const cleanUsername = normalizeUsername(username);
    if (!isValidUsername(cleanUsername)) return toast("اسم المستخدم غير صالح (3–20 حرفًا)", "error");
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim() || profile.display_name,
        username: cleanUsername,
        bio: bio.trim() || null,
        website: website.trim().replace(/^https?:\/\//, "") || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast(error.message.includes("duplicate") ? "اسم المستخدم محجوز" : friendlyError(error, "تعذّر الحفظ"), "error");
      return;
    }
    await refreshProfile();
    toast("تم حفظ إعدادات حسابك ✓");
    setOpen(false);
  };

  const deleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { error?: string; mode?: string };
      if (!res.ok) throw new Error(body.error ?? "delete_failed");
      toast(body.mode === "soft" ? "تم تعطيل ملفك وتسجيل خروجك" : "تم حذف حسابك نهائيًا");
      await supabase.auth.signOut().catch(() => {});
      window.location.href = "/welcome";
    } catch {
      toast("تعذّر الحذف الآن — أضف المفتاح السري الكامل في إعدادات Vercel ثم حاول مجددًا", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <section className="glass animate-fade-up rounded-[28px] p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 text-start" aria-expanded={open}>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/18 text-teal-200">
          <Settings2 className="h-5 w-5" />
        </span>
        <span className="flex-1">
          <span className="block font-bold text-white">إعدادات الحساب</span>
          <span className="block text-xs text-white/45">الاسم، اسم المستخدم، النبذة، الصورة الشخصية</span>
        </span>
        <span className={`text-white/40 transition-transform duration-300 ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="animate-fade-up mt-4 space-y-4 border-t border-white/[0.07] pt-4">
          {/* avatar */}
          <div className="flex items-center gap-3">
            <span className="relative">
              <Avatar profile={profile} size="lg" />
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55">
                  <Loader2 className="h-5 w-5 animate-spin text-white" />
                </span>
              )}
            </span>
            <div>
              <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={(e) => void uploadAvatar(e.target.files?.[0])} />
              <button
                onClick={() => avatarRef.current?.click()}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-4 py-2 text-sm font-bold text-white ring-1 ring-white/10 transition hover:bg-white/10 active:scale-95"
              >
                <Camera className="h-4 w-4 text-cyan-300" /> تغيير الصورة
              </button>
              <p className="mt-1.5 text-[11px] text-white/35">تُضغط تلقائيًا وتُرفع إلى Supabase Storage</p>
            </div>
          </div>

          <Field label="الاسم الظاهر" value={displayName} onChange={(v) => setDisplayName(v.slice(0, 40))} placeholder="اسمك" />
          <Field
            label="اسم المستخدم"
            value={username}
            onChange={(v) => setUsername(normalizeUsername(v))}
            placeholder="username"
            ltr
            icon={<UserRoundPen className="h-3.5 w-3.5" />}
          />
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-white/70">نبذة تعريفية</span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 160))}
              rows={3}
              placeholder="عرّف بنفسك في سطرين… ✨"
              className="input-glass w-full resize-none rounded-2xl px-4 py-3 text-[15px] text-white"
            />
            <span className="mt-1 block text-[11px] text-white/30">{bio.length}/160</span>
          </label>
          <Field label="موقعك الإلكتروني" value={website} onChange={setWebsite} placeholder="example.com" ltr icon={<Globe className="h-3.5 w-3.5" />} />

          <button onClick={() => void save()} disabled={saving} className="btn-primary flex w-full items-center justify-center gap-2 rounded-full py-3 font-black text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} حفظ التغييرات
          </button>

          <InstallButton variant="row" />

          <button onClick={() => void signOut()} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-start text-sm font-semibold text-white/85 transition hover:bg-white/[0.05]">
            <LogOut className="h-5 w-5 text-amber-300" /> تسجيل الخروج
          </button>

          {/* danger zone */}
          <div className="rounded-3xl bg-red-500/[0.07] p-3.5 ring-1 ring-red-400/20">
            <p className="text-sm font-bold text-red-200">منطقة الخطر</p>
            <p className="mt-1 text-xs leading-5 text-red-200/60">حذف الحساب نهائي ولا يمكن التراجع عنه (يُحذف المستخدم من Supabase Auth عبر المفتاح السري في الخادم فقط).</p>
            {confirmDelete ? (
              <div className="mt-3 flex gap-2">
                <button onClick={() => void deleteAccount()} disabled={deleting} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-red-500 py-2.5 text-sm font-black text-white transition active:scale-95 disabled:opacity-50">
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} نعم، احذف حسابي
                </button>
                <button onClick={() => setConfirmDelete(false)} className="rounded-full bg-white/[0.07] px-5 py-2.5 text-sm font-bold text-white">
                  إلغاء
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="mt-3 flex items-center gap-2 rounded-full bg-red-500/15 px-4 py-2 text-sm font-bold text-red-200 ring-1 ring-red-400/30 transition hover:bg-red-500/25">
                <Trash2 className="h-4 w-4" /> حذف الحساب نهائيًا
              </button>
            )}
          </div>

          <p className="text-center text-[11px] text-white/30" dir="ltr">
            {user.email} · Dz connect v1.0
          </p>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  ltr = false,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ltr?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-white/70">
        {icon} {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={ltr ? "ltr" : undefined}
        style={ltr ? { textAlign: "left" } : undefined}
        className="input-glass w-full rounded-2xl px-4 py-3 text-[15px] text-white"
      />
    </label>
  );
}
