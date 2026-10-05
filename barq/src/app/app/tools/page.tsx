"use client";

import { motion } from "framer-motion";
import { Crown, ImageOff, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePro } from "@/lib/pro-i18n";
import { PRO_TOOLS, TOOLS } from "@/lib/tools";
import { ToolCard } from "@/components/tool-card";
import { useCredits } from "@/components/app/app-shell";

export default function ToolsPage() {
  const { t } = useI18n();
  const pro = usePro();
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-9"
      >
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {t.app.toolsTitle}
        </h1>
        <p className="mt-2 text-slate-400">{t.app.toolsSub}</p>
      </motion.div>

      {/* v6 Pro: code analysis + game builder */}
      <section className="mb-12">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 text-[#2a1700]">
            <Crown className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-black text-white">{pro.toolsPro}</h2>
            <p className="text-sm text-slate-400">{pro.toolsProSub}</p>
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {PRO_TOOLS.map((tool, i) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              index={i}
              suffix={
                isPro ? (
                  t.toolsSec.open
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5 text-amber-300" />
                    {pro.locked}
                  </>
                )
              }
            />
          ))}
          <div
            aria-disabled="true"
            className="glass flex h-full cursor-not-allowed flex-col gap-3.5 rounded-3xl border-dashed p-5 opacity-80"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
              <ImageOff className="h-5 w-5 text-slate-400" strokeWidth={2} />
            </span>
            <div className="flex-1">
              <h3 className="mb-1 text-[15px] font-extrabold text-white">مولّد الصور</h3>
              <p className="text-[13px] leading-relaxed text-slate-400">توليد صور من الوصف النصي.</p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-bold text-orange-300">
              غير متوفر حاليًا
            </span>
          </div>
        </div>
      </section>

      <h2 className="mb-5 text-lg font-black text-white">{pro.toolsFree}</h2>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {TOOLS.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} index={i} suffix={t.toolsSec.open} />
        ))}
      </div>
    </div>
  );
}
