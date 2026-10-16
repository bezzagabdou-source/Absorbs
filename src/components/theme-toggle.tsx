"use client";

import { useEffect, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { ACCENTS, THEMES, applyTheme, readAtlasAppearance, type AccentId, type ThemeId } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * v18 ATLAS — the look is now a real choice.
 * Lumen (light) stays the default and the most polished surface; Noctis,
 * Midnight and Aurora are full dark looks, and every one of them follows the
 * accent colour picked here or in /app/control.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeId>("lumen");

  useEffect(() => {
    setTheme(readAtlasAppearance().theme);
    const onTheme = (e: Event) => setTheme(((e as CustomEvent).detail as ThemeId) ?? "lumen");
    window.addEventListener("barq:theme", onTheme);
    return () => window.removeEventListener("barq:theme", onTheme);
  }, []);

  const next: ThemeId = theme === "lumen" ? "noctis" : "lumen";
  return (
    <button
      type="button"
      title={theme === "lumen" ? "بدّل إلى المظهر الداكن" : "بدّل إلى المظهر الفاتح"}
      aria-label="تبديل المظهر"
      onClick={() => applyTheme(next)}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-brand-400 transition hover:bg-white/12 active:scale-95",
        className
      )}
    >
      <Sparkles className="h-4 w-4" />
    </button>
  );
}

const SWATCH: Record<ThemeId, string> = {
  lumen: "linear-gradient(135deg,#fffaf5,#ffe9d2 55%,var(--nx-accent-from))",
  noctis: "linear-gradient(135deg,#1b1917,#2a2622 55%,var(--nx-accent-from))",
  midnight: "linear-gradient(135deg,#000000,#0b0b10 55%,var(--nx-accent-from))",
  aurora: "linear-gradient(135deg,#12101f,#241a3f 45%,var(--nx-accent-from))",
};

/** Settings card — pick the look and the accent colour. */
export function ThemeCard() {
  const [{ theme, accent }, setLook] = useState<{ theme: ThemeId; accent: AccentId }>({ theme: "lumen", accent: "gold" });

  useEffect(() => {
    setLook(readAtlasAppearance());
  }, []);

  const pick = (t: ThemeId) => {
    applyTheme(t);
    setLook({ theme: t, accent });
  };

  const pickAccent = (a: AccentId) => {
    setLook({ theme, accent: a });
    try {
      const raw = localStorage.getItem("nexus:atlas-prefs:v18");
      const p = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      p.appearance = { ...((p.appearance as Record<string, unknown>) ?? {}), accent: a, theme };
      localStorage.setItem("nexus:atlas-prefs:v18", JSON.stringify(p));
    } catch {
      /* private mode */
    }
    applyTheme(theme);
    window.dispatchEvent(new CustomEvent("barq:prefs", { detail: { appearance: { accent: a } } }));
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            aria-pressed={theme === t.id}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-3 text-right transition active:scale-[0.99]",
              theme === t.id ? "border-brand-400/60 bg-white/70 shadow-[0_14px_34px_-26px_rgba(0,0,0,.6)]" : "border-white/10 bg-white/40 hover:border-white/30"
            )}
          >
            <span className="h-11 w-11 shrink-0 rounded-xl border border-black/10" style={{ background: SWATCH[t.id] }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-black text-slate-100">{t.name}</span>
              <span className="block text-[10.5px] text-slate-400">{t.dark ? "مظهر داكن" : "مظهر فاتح"}</span>
            </span>
            {theme === t.id && <Check className="size-4 shrink-0 text-brand-500" />}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/40 p-3">
        <span className="block text-[12px] font-black text-slate-200">لون الهوية</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(ACCENTS) as AccentId[]).map((id) => (
            <button
              key={id}
              type="button"
              title={ACCENTS[id].name}
              aria-label={ACCENTS[id].name}
              aria-pressed={accent === id}
              onClick={() => pickAccent(id)}
              className={cn(
                "grid size-8 place-items-center rounded-xl border-2 transition active:scale-90",
                accent === id ? "border-slate-300/80 shadow-md" : "border-black/10 hover:border-black/30"
              )}
              style={{ background: `linear-gradient(135deg, ${ACCENTS[id].from}, ${ACCENTS[id].to})` }}
            >
              {accent === id && <Check className="size-3.5 text-white drop-shadow" />}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          كل المقابض الدقيقة (الحركة، الكثافة، حجم الخط، الصوت، الذكاء، الإنترنت، الملفات، الخصوصية، الوصولية) في
          مركز التحكم.
        </p>
      </div>
    </div>
  );
}
