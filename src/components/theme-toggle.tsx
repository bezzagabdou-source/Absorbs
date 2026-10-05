"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Check } from "lucide-react";
import { applyTheme, readTheme, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

function useTheme(): [ThemeId, (t: ThemeId) => void] {
  const [theme, setTheme] = useState<ThemeId>("dark");
  useEffect(() => {
    setTheme(readTheme());
    const on = (e: Event) => setTheme((e as CustomEvent<ThemeId>).detail);
    window.addEventListener("barq:theme", on);
    return () => window.removeEventListener("barq:theme", on);
  }, []);
  // makes sure the animated background class survives client navigation / reloads
  useEffect(() => {
    document.body.classList.toggle("bg-orange-animated", theme === "orange-claude");
  }, [theme]);
  return [theme, (t) => applyTheme(t)];
}

/** Small round sun/moon button (header / sidebar). */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, set] = useTheme();
  const light = theme === "orange-claude";
  return (
    <button
      type="button"
      onClick={() => set(light ? "dark" : "orange-claude")}
      aria-label={light ? "المظهر الداكن" : "المظهر البرتقالي الفاتح"}
      title={light ? "المظهر الداكن" : "المظهر البرتقالي الفاتح"}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 transition hover:bg-brand-500/10 hover:text-white active:scale-90",
        className
      )}
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}

/** Settings card with a live preview of both looks. */
export function ThemeCard() {
  const [theme, set] = useTheme();
  const opts: { id: ThemeId; title: string; desc: string; swatch: string }[] = [
    {
      id: "dark",
      title: "الداكن الدافئ (Claude)",
      desc: "فحمي دافئ مع لمسة تيراكوتا — المظهر الافتراضي",
      swatch: "linear-gradient(135deg,#181816,#2a2926 55%,#d97757)",
    },
    {
      id: "orange-claude",
      title: "المظهر الفاتح (برتقالي وأبيض)",
      desc: "خلفية بيضاء متحركة مع لمسات برتقالية ناعمة",
      swatch: "linear-gradient(135deg,#fffaf5,#ffeede 55%,#f97316)",
    },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="المظهر">
      {opts.map((o) => {
        const on = theme === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => set(o.id)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-3.5 text-start transition active:scale-[0.98]",
              on ? "border-gold-400/60 bg-gold-400/10 ring-1 ring-gold-400/40" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
            )}
          >
            <span className="h-12 w-12 shrink-0 rounded-xl border border-black/10" style={{ background: o.swatch }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black text-white">{o.title}</span>
              <span className="mt-0.5 block text-xs text-slate-400">{o.desc}</span>
            </span>
            {on && <Check className="h-4.5 w-4.5 shrink-0 text-gold-400" />}
          </button>
        );
      })}
    </div>
  );
}
