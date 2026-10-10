"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Nexus AI v15 runs a single, hand-tuned light look ("Lumen").
 * The toggle stays as a decorative badge so every old import keeps working.
 */
export function ThemeToggle({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      title="مظهر Lumen الفاتح"
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-brand-500/80",
        className
      )}
    >
      <Sparkles className="h-4 w-4" />
    </span>
  );
}

/** Settings card — informational now that Lumen is the only theme. */
export function ThemeCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-400/30 bg-white/70 p-4 shadow-[0_18px_40px_-30px_rgba(79,70,229,0.5)]">
      <span
        className="h-12 w-12 shrink-0 rounded-xl border border-black/10"
        style={{ background: "linear-gradient(135deg,#ffffff,#eef2ff 45%,#c7d2fe 75%,#f9a8d4)" }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black text-slate-100">Lumen — المظهر الفاتح الفاخر</span>
        <span className="mt-0.5 block text-xs text-slate-400">
          مظهر واحد مضبوط بدقّة: خلفية حريرية متحركة، تباين عالٍ وراحة للعين في كل الشاشات.
        </span>
      </span>
    </div>
  );
}
