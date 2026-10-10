"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  BadgeCheck,
  Download,
  SendHorizonal,
} from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { InstallButton } from "@/components/pwa";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

/** Looping typewriter effect */
function useTypewriter(text: string, speed: number, startDelay = 0, resetKey: string) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let i = 0;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length && interval) clearInterval(interval);
      }, speed);
    }, startDelay);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay, resetKey]);
  return text.slice(0, n);
}

function ChatMock() {
  const { t } = useI18n();
  const cycle = useMemo(() => t.hero.chatUser + "|" + t.hero.chatAi, [t]);
  const userText = useTypewriter(t.hero.chatUser, 26, 600, cycle);
  const userDone = userText.length >= t.hero.chatUser.length;
  const aiDelay = 600 + t.hero.chatUser.length * 26 + 900;
  const aiText = useTypewriter(t.hero.chatAi, 14, aiDelay, cycle);

  return (
    <motion.div
      initial={{ opacity: 0, y: 44, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-full max-w-lg"
    >
      <div className="glass-deep relative overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
          <Logo size={26} />
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300 ring-1 ring-emerald-400/25">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {t.common.online}
          </span>
        </div>

        <div className="flex min-h-[290px] flex-col gap-3 p-5">
          {/* user bubble */}
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-se-md bg-gradient-to-br from-brand-600 to-aqua-500 px-4 py-3 text-[13px] font-semibold leading-relaxed text-[#fff] shadow-lg">
              {userText}
              {!userDone && (
                <span className="ms-0.5 inline-block h-3.5 w-[2px] animate-blink bg-white/80 align-middle" />
              )}
            </div>
          </div>
          {/* ai bubble */}
          {userDone && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2.5"
            >
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand-500 to-gold-400 text-sm font-bold leading-none text-[#fff]">
                ب
              </span>
              <div className="max-w-[88%] whitespace-pre-line rounded-2xl rounded-ss-md border border-white/10 bg-white/5 px-4 py-3 text-[13px] leading-relaxed text-slate-200">
                {aiText}
                <span className="ms-0.5 inline-block h-3.5 w-[2px] animate-blink bg-aqua-300 align-middle" />
              </div>
            </motion.div>
          )}
        </div>

        {/* fake input */}
        <div className="border-t border-white/8 p-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span className="flex-1 truncate text-[13px] text-slate-500">
              {t.app.inputPlaceholder}
            </span>
            <SendHorizonal className="h-4 w-4 rotate-180 text-brand-300 [html[dir=ltr]_&]:rotate-0" />
          </div>
        </div>
      </div>

    </motion.div>
  );
}

export function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative overflow-hidden pt-36 pb-20 sm:pt-44">
      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2 lg:gap-8">
        <div className="text-center lg:text-start">

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08 }}
            className="text-[2.6rem] font-black leading-[1.15] tracking-tight text-white sm:text-6xl"
          >
            {t.hero.titleA}
            <br />
            <span className="text-gradient">{t.hero.titleB}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16 }}
            className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg lg:mx-0"
          >
            {t.hero.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24 }}
            className="mt-9 flex flex-wrap items-center justify-center gap-3.5 lg:justify-start"
          >
            <Link
              href="/signup"
              className="btn-primary px-7 py-3.5 text-base"
            >
              {t.hero.cta1}
            </Link>
            <a href="#tools" className="btn-ghost px-6 py-3.5 text-base">
              {t.hero.cta2}
              <ArrowDown className="h-4 w-4" />
            </a>
            <InstallButton className="btn-ghost px-5 py-3.5 text-base">
              <Download className="h-4 w-4" />
              {t.common.install}
            </InstallButton>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500 lg:justify-start"
          >
            {t.hero.points.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5 text-aqua-400" />
                {p}
              </span>
            ))}
          </motion.div>
        </div>

        <div className="flex justify-center lg:justify-start">
          <ChatMock />
        </div>
      </div>
    </section>
  );
}
