"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Crown,
  Download,
  Globe,
  LogOut,
  Mail,
  User as UserIcon,
  Coins,
  Bell,
  HardDrive,
  ShieldCheck,
  Brain,
  Palette,
} from "lucide-react";
import { Row } from "@/components/settings-ui";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { LOCALE_NAMES, useI18n } from "@/lib/i18n";
import { useCredits, UserAvatar, meterLabel } from "@/components/app/app-shell";
import { InstallButton } from "@/components/pwa";
import { ThemeCard } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { t, locale } = useI18n();
  const { user, signOut } = useAuth();
  const { profile } = useCredits();
  const router = useRouter();

  const isPro = profile?.plan === "pro";

  const fmt = (iso?: string) => {
    if (!iso) return "—";
    try {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(iso));
    } catch {
      return "—";
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 text-2xl font-black text-white sm:text-3xl"
      >
        {t.app.settingsTitle}
      </motion.h1>

      <div className="space-y-6">
        {/* account */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="glass rounded-3xl p-6"
        >
          <h2 className="mb-5 flex items-center gap-2 text-sm font-black text-slate-300">
            <UserIcon className="h-4.5 w-4.5 text-brand-300" />
            {t.app.account}
          </h2>
          <div className="flex flex-wrap items-center gap-5">
            <UserAvatar
              name={profile?.user.displayName ?? user?.displayName ?? null}
              photo={profile?.user.photoUrl ?? user?.photoURL ?? null}
              size={68}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black text-white">
                {profile?.user.displayName ?? user?.displayName ?? "Nexus AI v8.4"}
              </p>
              <p
                className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-slate-400"
                dir="ltr"
              >
                <Mail className="h-3.5 w-3.5" />
                {user?.email}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">
                {t.app.memberSince} {fmt(profile?.user.createdAt)} •{" "}
                {profile?.user.totalRuns ?? 0} {t.app.totalRuns}
              </p>
            </div>
          </div>
        </motion.section>

        {/* appearance */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="glass rounded-3xl p-6"
        >
          <h2 className="mb-5 flex items-center gap-2 text-sm font-black text-slate-300">
            <Palette className="h-4.5 w-4.5 text-brand-300" />
            المظهر
          </h2>
          <ThemeCard />
        </motion.section>

        {/* sections — each opens its own page */}
        <section className="space-y-3">
          <Row icon={Globe} title={t.common.language} desc={LOCALE_NAMES[locale]} href="/app/settings/language" />
          <Row icon={Brain} title="ذاكرة Nexus AI v8.4" desc="ما يتذكره Nexus AI v8.4 عنك في كل محادثة" href="/app/settings/memory" />
          <Row icon={ShieldCheck} title="مركز الأمان" desc="تفعيل البريد، كلمة المرور، سجل الدخول" href="/app/settings/security" />
          <Row icon={ShieldCheck} title="الخصوصية" desc="حذف المحادثات والسياسات" href="/app/settings/privacy" />
          <Row icon={Bell} title="الإشعارات" desc="تذكيرات وعروض" href="/app/settings/notifications" />
          <Row icon={HardDrive} title="التخزين" desc="مسح الذاكرة المؤقتة" href="/app/settings/storage" />
        </section>

        {/* plan */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass rounded-3xl p-6"
        >
          <h2 className="mb-5 flex items-center gap-2 text-sm font-black text-slate-300">
            <Crown className="h-4.5 w-4.5 text-amber-300" />
            {t.app.planLabel}
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-black",
                  isPro
                    ? "bg-gradient-to-b from-gold-200 to-gold-500 text-[#2a1700]"
                    : "bg-white/10 text-slate-300"
                )}
              >
                {isPro ? t.app.proPlanTag : t.app.freePlanTag}
              </span>
              <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-400">
                <Coins className="h-4 w-4 text-aqua-400" />
                {isPro
                  ? t.app.unlimited
                  : meterLabel(profile)}
              </p>
            </div>
            {!isPro && (
              <Link href="/app/upgrade" className="btn-primary px-6 py-3 text-sm">
                <Crown className="h-4 w-4" />
                {t.app.upgradeNow}
              </Link>
            )}
          </div>
        </motion.section>

        {/* install + signout */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap gap-4"
        >
          <InstallButton className="btn-ghost flex-1 py-3.5 text-sm">
            <Download className="h-4.5 w-4.5" />
            {t.common.install}
          </InstallButton>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              router.replace("/");
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-400/25 bg-rose-500/8 py-3.5 text-sm font-black text-rose-300 transition hover:bg-rose-500/15"
          >
            <LogOut className="h-4.5 w-4.5" />
            {t.app.signOut}
          </button>
        </motion.section>
      </div>
    </div>
  );
}
