"use client";

import { ChatSkeleton } from "@/components/chat-skeleton";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  Brain,
  CheckCircle2,
  Code2,
  CreditCard,
  Crown,
  Gamepad2,
  ImagePlus,
  KeyRound,
  Loader2,
  Minus,
  Rocket,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { usePro } from "@/lib/pro-i18n";
import { InlineNotice, useCredits } from "@/components/app/app-shell";
import { cn } from "@/lib/utils";
import { TierCompare } from "@/components/app/tier-compare";
import { PRO_ACTIVATED_EVENT, PRO_SHOW_TOUR_EVENT } from "@/components/pro-welcome-gate";

function UpgradeInner() {
  const { t, locale } = useI18n();
  const pro = usePro();
  const { authFetch } = useAuth();
  const { profile, refresh } = useCredits();
  const params = useSearchParams();

  const [payBusy, setPayBusy] = useState<"monthly" | "yearly" | null>(null);
  const [payNote, setPayNote] = useState(false);
  const [code, setCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<"ok" | "bad" | null>(null);
  const [redeemErr, setRedeemErr] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (params.get("status") === "success") {
      setShowSuccess(true);
      void refresh().then(() => window.dispatchEvent(new Event(PRO_ACTIVATED_EVENT)));
    }
  }, [params, refresh]);

  const pay = async (period: "monthly" | "yearly") => {
    setPayBusy(period);
    setPayNote(false);
    try {
      const res = await authFetch("/api/billing/chargily", {
        method: "POST",
        body: JSON.stringify({ period }),
      });
      const data = (await res.json()) as { checkout_url?: string };
      if (res.ok && data.checkout_url) {
        window.location.assign(data.checkout_url);
        return;
      }
      setPayNote(true);
    } catch {
      setPayNote(true);
    } finally {
      setPayBusy(null);
    }
  };

  const redeem = async () => {
    if (!code.trim() || redeemBusy) return;
    setRedeemBusy(true);
    setRedeemMsg(null);
    setRedeemErr(null);
    try {
      const res = await authFetch("/api/billing/redeem", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setRedeemMsg(res.ok ? "ok" : "bad");
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { code?: string; detail?: string };
        const ar = locale === "ar";
        const map: Record<string, string> = {
          INVALID_CODE: ar ? "هذا الكود غير موجود" : "This code does not exist",
          USED: ar ? "هذا الكود مستعمل من قبل" : "This code was already used",
          RATE: ar ? "محاولات كثيرة، انتظر دقيقة ثم أعد المحاولة" : "Too many attempts, wait a minute",
          UNAUTHENTICATED: ar ? "سجّل الدخول من جديد ثم أعد المحاولة" : "Please sign in again",
          DB: ar ? "خطأ في السيرفر/قاعدة البيانات (تحقق من DATABASE_URL في Vercel)" : "Server/database error (check DATABASE_URL in Vercel)",
        };
        if (d.code === "DB" && d.detail) {
          setRedeemErr(`${map.DB}\n${d.detail}`);
          return;
        }
        setRedeemErr(map[d.code ?? ""] ?? (ar ? `خطأ غير متوقع (${res.status})` : `Unexpected error (${res.status})`));
      }
      if (res.ok) {
        setCode("");
        await refresh();
        window.dispatchEvent(new Event(PRO_ACTIVATED_EVENT));
      }
    } catch {
      setRedeemMsg("bad");
    } finally {
      setRedeemBusy(false);
    }
  };

  const isPro = profile?.plan === "pro";
  const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(iso));
    } catch {
      return null;
    }
  };

  const L = (ar: string, fr: string, en: string) => (locale === "ar" ? ar : locale === "fr" ? fr : en);
  const featureIcons = [Zap, Code2, Gamepad2, ImagePlus, Brain, Rocket, Sparkles, ShieldCheck];
  const compare: { label: string; free: string | null; pro: string }[] = [
    { label: L("النقاط اليومية", "Crédits par jour", "Daily credits"), free: L("محدودة", "Limités", "Limited"), pro: L("شبه غير محدودة", "Quasi illimités", "Near unlimited") },
    { label: L("النماذج", "Modèles", "Models"), free: L("سريع (Flash)", "Rapide (Flash)", "Fast (Flash)"), pro: L("أحدث النماذج", "Derniers modèles", "Newest models") },
    { label: L("أدوات الكود", "Outils de code", "Code tools"), free: null, pro: L("مراجعة · إصلاح · أمان", "Revue · correction · sécurité", "Review · fix · security") },
    { label: L("صانع الألعاب", "Créateur de jeux", "Game builder"), free: null, pro: L("ألعاب كاملة + معاينة", "Jeux complets + aperçu", "Full games + preview") },
    { label: L("رفع الصور والملفات", "Images et fichiers", "Image & file upload"), free: null, pro: "PDF · PNG · Code" },
    { label: L("الأركيد: عاصفة Nexus", "Arcade : Nexus Storm", "Arcade: Nexus Storm"), free: L("3 مراحل", "3 niveaux", "3 levels"), pro: L("كل المراحل والزعماء", "Tous niveaux et boss", "All levels & bosses") },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 px-4 py-8 sm:px-6 lg:py-12">
      {/* ---------------- hero ---------------- */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative mb-10 text-center"
      >
        <div className="relative mx-auto mb-6 grid h-28 w-28 place-items-center">
          <span className="gold-halo" aria-hidden />
          <span className="sparkle" style={{ top: "6%", insetInlineStart: "8%", animationDelay: "0s" }} aria-hidden />
          <span className="sparkle" style={{ top: "18%", insetInlineEnd: "2%", animationDelay: "0.9s" }} aria-hidden />
          <span className="sparkle" style={{ bottom: "10%", insetInlineStart: "0%", animationDelay: "1.7s" }} aria-hidden />
          <span className="sparkle" style={{ bottom: "2%", insetInlineEnd: "14%", animationDelay: "2.2s" }} aria-hidden />
          <span className="pro-shine grid h-24 w-24 place-items-center rounded-[1.8rem] bg-gradient-to-br from-gold-200 via-gold-400 to-gold-600 text-[#2a1700] shadow-[0_20px_50px_-12px_rgba(251,191,36,0.85),inset_0_2px_0_rgba(255,255,255,0.7)]">
            <Crown className="h-12 w-12" strokeWidth={2.2} />
          </span>
        </div>
        <span className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-gold-400/40 bg-gold-400/10 px-4 py-1.5 text-xs font-black text-gold-300">
          <Sparkles className="h-3.5 w-3.5" />
          {t.app.proBadge}
        </span>
        <h1 className="gold-text text-3xl font-black leading-tight sm:text-5xl">
          {t.app.upgradeTitle}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-slate-300">{t.app.upgradeSub}</p>
      </motion.div>

      {showSuccess && (
        <div className="mb-6">
          <InlineNotice kind="info" text={t.app.redeemOk} />
        </div>
      )}

      {/* ---------------- current plan ---------------- */}
      <div
        className={cn(
          "mb-8 flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5 sm:p-6",
          isPro ? "gold-card" : "glass"
        )}
      >
        <div className="flex items-center gap-4">
          <span
            className={cn(
              "grid h-12 w-12 place-items-center rounded-2xl",
              isPro
                ? "bg-gradient-to-br from-gold-200 to-gold-500 text-[#2a1700] shadow-[0_8px_24px_-8px_rgba(251,191,36,0.9)]"
                : "bg-brand-500/20 text-brand-300"
            )}
          >
            <Crown className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold text-slate-400">{t.app.currentPlan}</p>
            <p className="text-lg font-black text-white">
              {isPro ? t.app.proPlanTag : t.app.freePlanTag}
              {isPro && profile?.planExpiresAt && (
                <span className="ms-2 text-xs font-bold text-gold-300/80">
                  {profile.trial ? "🎁 تجربة 7 أيام مجانية — تنتهي في" : t.app.activeUntil} {fmtDate(profile.planExpiresAt)}
                </span>
              )}
            </p>
          </div>
        </div>
        {isPro && (
          <span className="flex items-center gap-2 rounded-full bg-emerald-400/10 px-4 py-2 text-sm font-black text-emerald-300 ring-1 ring-emerald-400/30">
            <BadgeCheck className="h-4 w-4" />
            {t.app.unlimited}
          </span>
        )}
      </div>

      {isPro && (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(PRO_SHOW_TOUR_EVENT))}
          className="btn-gold mb-8 w-full py-3.5"
        >
          <Sparkles className="h-5 w-5" />
          {L("استعرض ميزات Nexus AI v8.4 Pro وجرّبها", "Découvrir et essayer Nexus AI v8.4 Pro", "Explore and try Nexus AI v8.4 Pro")}
        </button>
      )}

      {/* ---------------- the four levels ---------------- */}
      <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-gold-300">
        <Rocket className="h-4 w-4" />
        الفرق بين Nexus 5 و6 و8 وMAX
      </h2>
      <TierCompare className="mb-10" />

      {/* ---------------- what Pro adds ---------------- */}
      <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-gold-300">
        <Crown className="h-4 w-4" />
        {pro.proFeaturesTitle}
      </h2>
      <ul className="mb-10 grid gap-3 sm:grid-cols-2">
        {pro.proFeatures.map((f, i) => {
          const Icon = featureIcons[i % featureIcons.length];
          return (
            <motion.li
              key={f}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
              className="pro-card flex items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed text-slate-200"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gold-300/25 to-brand-500/25 text-gold-300 ring-1 ring-gold-400/30">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 pt-0.5">{f}</span>
            </motion.li>
          );
        })}
      </ul>

      {/* ---------------- free vs pro ---------------- */}
      <div className="glass-deep mb-10 overflow-hidden rounded-3xl">
        <div className="grid grid-cols-[1.3fr_1fr_1.2fr] items-center gap-2 border-b border-brand-400/20 bg-brand-500/10 px-4 py-3 text-xs font-black">
          <span className="text-slate-400">{L("الميزة", "Fonction", "Feature")}</span>
          <span className="text-center text-slate-300">{L("مجاني", "Gratuit", "Free")}</span>
          <span className="flex items-center justify-center gap-1 text-center text-gold-300">
            <Crown className="h-3.5 w-3.5" />
            Pro
          </span>
        </div>
        {compare.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-[1.3fr_1fr_1.2fr] items-center gap-2 border-b border-white/5 px-4 py-3 text-[12.5px] last:border-b-0"
          >
            <span className="min-w-0 font-bold text-slate-200">{r.label}</span>
            <span className="flex justify-center text-center text-slate-400">
              {r.free ?? <Minus className="h-4 w-4 text-slate-600" />}
            </span>
            <span className="text-center font-black text-gold-200">{r.pro}</span>
          </div>
        ))}
      </div>

      <p className="mb-4 text-sm font-black text-slate-200">{t.app.choosePay}</p>

      {/* ---------------- payment plans ---------------- */}
      <div className="grid gap-5 sm:grid-cols-2">
        {(
          [
            { period: "monthly" as const, price: t.app.dzdMonth, per: t.app.perMo, name: t.app.monthPlan },
            { period: "yearly" as const, price: t.app.dzdYear, per: t.app.perYr, name: t.app.yearPlan, save: t.pricing.save },
          ]
        ).map((p, i) => {
          const gold = p.period === "yearly";
          return (
            <motion.div
              key={p.period}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className={cn(
                "relative flex min-w-0 flex-col rounded-3xl p-6",
                gold ? "gold-border shadow-[0_30px_70px_-36px_rgba(251,191,36,0.7)]" : "glass"
              )}
            >
              {p.save && (
                <span className="absolute -top-3 end-5 rounded-full bg-gradient-to-r from-gold-200 to-gold-500 px-3 py-1 text-[11px] font-black text-[#2a1700] shadow-[0_6px_18px_-6px_rgba(251,191,36,0.9)]">
                  {p.save}
                </span>
              )}
              <p className={cn("text-sm font-black", gold ? "text-gold-300" : "text-slate-300")}>{p.name}</p>
              <div className="my-4 flex items-end gap-1.5">
                <span className={cn("font-display text-4xl font-black", gold ? "gold-text" : "text-white")}>
                  {p.price}
                </span>
                <span className="pb-1 text-xs font-bold text-slate-400">{p.per}</span>
              </div>
              <ul className="mb-5 space-y-2 text-xs text-slate-300">
                {t.pricing.pro.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", gold ? "text-gold-400" : "text-brand-300")} />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={payBusy !== null}
                onClick={() => void pay(p.period)}
                className={cn("mt-auto w-full", gold ? "btn-gold" : "btn-primary")}
              >
                {payBusy === p.period ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <CreditCard className="h-4.5 w-4.5" />
                )}
                {t.app.payCard}
              </button>
              <p className="mt-2.5 text-center text-[11px] text-slate-400">{t.app.payCardNote}</p>
            </motion.div>
          );
        })}
      </div>

      {payNote && (
        <div className="mt-5">
          <InlineNotice kind="warn" text={t.app.payUnavailable} />
        </div>
      )}

      {/* ---------------- redeem ---------------- */}
      <div className="gold-card mt-8 rounded-3xl p-5 sm:p-6">
        <h3 className="mb-1 flex items-center gap-2 text-base font-black text-white">
          <KeyRound className="h-5 w-5 text-gold-400" />
          {t.app.redeemTitle}
        </h3>
        <div className="mt-4 flex min-w-0 gap-3">
          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setRedeemMsg(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && void redeem()}
            placeholder={t.app.redeemPh}
            dir="ltr"
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            className="input-base min-w-0 flex-1 font-display tracking-widest"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void redeem()}
            disabled={redeemBusy || !code.trim()}
            className="btn-gold shrink-0 px-6"
          >
            {redeemBusy ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : t.app.redeemBtn}
          </button>
        </div>
        {redeemMsg === "ok" && (
          <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
            {t.app.redeemOk}
          </p>
        )}
        {redeemMsg === "bad" && (
          <p dir="auto" className="mt-3 whitespace-pre-line break-words rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-300">
            {redeemErr ?? t.app.redeemBad}
          </p>
        )}
      </div>
    </div>
  );
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <UpgradeInner />
    </Suspense>
  );
}
