"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Brain, Crown, Gamepad2, ImagePlus, Mic, Rocket, Sparkles, X, Zap } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCredits } from "@/components/app/app-shell";

const PERKS = [
  { icon: Rocket, text: "Nexus 8 Pro — نموذج واحد سريع وقوي للألعاب والمواقع والكود" },
  { icon: Brain, text: "كل النماذج + فريق ذكاء اصطناعي على المهام الصعبة" },
  { icon: ImagePlus, text: "استوديو الصور الأسطوري (حتى 3 نسخ)" },
  { icon: Gamepad2, text: "بناء الألعاب والمواقع الضخمة" },
  { icon: Mic, text: "مكالمة صوتية + رفع الملفات + الذاكرة" },
  { icon: Zap, text: "أقصى سرعة بدون عدّاد وقت" },
];

function daysLeft(iso?: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

/** Shown once per device when a trial account enters the app: a big, beautiful "7 days free, everything unlocked" banner. */
export function TrialWelcome() {
  const { user } = useAuth();
  const { profile } = useCredits();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const shown = useRef(false);
  const uid = user?.uid ?? "";
  const key = `nexus_trial_welcome_${uid}`;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (shown.current || !uid || !profile?.trial) return;
    shown.current = true;
    try {
      if (localStorage.getItem(key) === "1") return;
    } catch {
      /* private mode: show once per visit */
    }
    setOpen(true);
  }, [uid, profile?.trial, key]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* ignore */
    }
  }, [key]);

  if (!mounted) return null;
  const left = daysLeft(profile?.trialEndsAt);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto p-4"
          style={{ background: "radial-gradient(circle at 50% 0%, rgba(217,119,87,.28), rgba(10,9,8,.94) 60%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          dir="rtl"
        >
          <motion.div
            className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-white/10 bg-[#22211f] p-6 text-[#f3f3ee] shadow-[0_30px_120px_rgba(217,119,87,.35)]"
            initial={reduce ? false : { y: 40, scale: 0.94, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 20, scale: 0.97, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl"
              style={{ background: "conic-gradient(from 0deg, #d97757, #f5c451, #e8946f, #d97757)", opacity: 0.35 }}
            />
            <button
              onClick={close}
              aria-label="إغلاق"
              className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white/8 text-[#b0ad9e] transition hover:bg-white/15"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="relative text-center">
              <motion.div
                animate={reduce ? undefined : { rotate: [0, -6, 6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mx-auto mb-3 grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-[#f5c451] via-[#e8946f] to-[#d97757] shadow-[0_10px_40px_rgba(217,119,87,.55)]"
              >
                <Crown className="h-10 w-10 text-[#2a1700]" />
              </motion.div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#f5c451]/40 bg-[#f5c451]/10 px-3 py-1 text-xs font-black text-[#f5c451]">
                <Sparkles className="h-3.5 w-3.5" /> هدية الإطلاق
              </div>
              <h2 className="mt-3 text-3xl font-black leading-tight">
                7 أيام مجانًا
                <span className="block bg-gradient-to-l from-[#f5c451] to-[#d97757] bg-clip-text text-transparent">
                  كل النماذج وكل الميزات مفتوحة
                </span>
              </h2>
              <p className="mt-2 text-sm leading-7 text-[#b0ad9e]">
                جرّب Nexus AI بأقصى قوته بدون أي قيود
                {left > 0 ? ` — تبقّى لك ${left} ${left === 1 ? "يوم" : "أيام"}` : ""}.
              </p>
            </div>

            <ul className="relative mt-5 space-y-2">
              {PERKS.map((p, i) => (
                <motion.li
                  key={p.text}
                  initial={reduce ? false : { opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07 }}
                  className="flex items-center gap-3 rounded-2xl bg-[#2a2926] px-3.5 py-2.5 text-sm font-bold"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#d97757]/15 text-[#e8946f]">
                    <p.icon className="h-4 w-4" />
                  </span>
                  {p.text}
                </motion.li>
              ))}
            </ul>

            <button
              onClick={close}
              className="relative mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-[#d97757] to-[#f5c451] px-5 text-base font-black text-[#2a1700] shadow-[0_10px_30px_rgba(217,119,87,.45)] transition active:scale-[.98]"
            >
              <Rocket className="h-5 w-5" /> ابدأ الآن
            </button>
            <Link href="/app/upgrade" onClick={close} className="relative mt-3 block text-center text-xs font-bold text-[#b0ad9e] underline-offset-4 hover:underline">
              شاهد خطط ما بعد التجربة
            </Link>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
