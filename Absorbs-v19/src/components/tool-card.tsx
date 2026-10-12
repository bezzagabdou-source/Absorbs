"use client";

import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import type { ToolDef } from "@/lib/tools";
import { loc } from "@/lib/tools";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const ACCENTS: Record<
  ToolDef["accent"],
  { chip: string; icon: string; glow: string }
> = {
  // one calm tone for every tool — no rainbow of colored chips
  violet: { chip: "bg-white/[0.05] border-white/10", icon: "text-brand-400", glow: "" },
  cyan: { chip: "bg-white/[0.05] border-white/10", icon: "text-brand-400", glow: "" },
  sky: { chip: "bg-white/[0.05] border-white/10", icon: "text-brand-400", glow: "" },
  emerald: { chip: "bg-white/[0.05] border-white/10", icon: "text-brand-400", glow: "" },
  amber: { chip: "bg-white/[0.05] border-white/10", icon: "text-brand-400", glow: "" },
  rose: { chip: "bg-white/[0.05] border-white/10", icon: "text-brand-400", glow: "" },
};

export function ToolCard({
  tool,
  index = 0,
  suffix,
}: {
  tool: ToolDef;
  index?: number;
  suffix?: React.ReactNode;
}) {
  const { locale, dir } = useI18n();
  const accent = ACCENTS[tool.accent];
  const Icon: LucideIcon = tool.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: (index % 5) * 0.06 }}
    >
      <Link
        href={`/app/tools/${tool.id}`}
        className={cn(
          "group glass relative flex h-full flex-col gap-3.5 rounded-3xl p-5 transition-colors duration-200 hover:border-brand-500/50",
          accent.glow
        )}
      >
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl border",
            accent.chip
          )}
        >
          <Icon className={cn("h-5.5 w-5.5", accent.icon)} strokeWidth={2} />
        </span>
        <div className="flex-1">
          <h3 className="mb-1 text-[15px] font-extrabold text-white">
            {loc(tool.name, locale)}
          </h3>
          <p className="text-[13px] leading-relaxed text-slate-400">
            {loc(tool.desc, locale)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-300 transition-colors group-hover:text-brand-400">
          {suffix}
          <ArrowLeft
            className={cn(
              "h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5",
              dir === "ltr" && "rotate-180 group-hover:translate-x-0.5 group-hover:-translate-x-0"
            )}
          />
        </span>
      </Link>
    </motion.div>
  );
}
