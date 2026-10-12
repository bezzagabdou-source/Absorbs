"use client";

/**
 * NEXUS v18 — the appearance system.
 *
 * One small context owns the visual preferences and writes them onto
 * <html> as data attributes, which the ATLAS design layer in globals.css
 * turns into real CSS variables. No re-render storms, no flash of wrong
 * theme: the boot script applies the saved values before first paint.
 *
 *   accent   indigo · aurora · ember · mint · rose · gold
 *   mode     lumen (light) · midnight (dark)
 *   density  compact · default · cozy
 *   scale    sm · md · lg · xl        (base font size)
 *   wide     0 · 1                    (up to 1800px of screen)
 *   motion   on · off                 (respects prefers-reduced-motion)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AccentId = "indigo" | "aurora" | "ember" | "mint" | "rose" | "gold";
export type ModeId = "lumen" | "midnight";
export type DensityId = "compact" | "default" | "cozy";
export type ScaleId = "sm" | "md" | "lg" | "xl";

export interface Appearance {
  accent: AccentId;
  mode: ModeId;
  density: DensityId;
  scale: ScaleId;
  wide: boolean;
  motion: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = {
  accent: "indigo",
  mode: "lumen",
  density: "default",
  scale: "md",
  wide: true,
  motion: true,
};

const KEY = "nexus_appearance_v18";

export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: "indigo", label: "نيلي", swatch: "linear-gradient(120deg,#6366f1,#8b5cf6)" },
  { id: "aurora", label: "شفق", swatch: "linear-gradient(120deg,#0ea5e9,#22d3ee)" },
  { id: "ember", label: "جمر", swatch: "linear-gradient(120deg,#f97316,#fb7185)" },
  { id: "mint", label: "نعناع", swatch: "linear-gradient(120deg,#10b981,#34d399)" },
  { id: "rose", label: "وردي", swatch: "linear-gradient(120deg,#e11d48,#fb7185)" },
  { id: "gold", label: "ذهبي", swatch: "linear-gradient(120deg,#d97706,#f59e0b)" },
];

/** Runs before paint — keeps the first frame in the right theme. */
export const APPEARANCE_BOOT_SCRIPT = `try{
 var r=document.documentElement;
 var s=JSON.parse(localStorage.getItem('${KEY}')||'{}');
 r.setAttribute('data-accent',s.accent||'indigo');
 r.setAttribute('data-nx-mode',s.mode||'lumen');
 r.setAttribute('data-density',s.density||'default');
 r.setAttribute('data-scale',s.scale||'md');
 r.setAttribute('data-wide',s.wide===false?'0':'1');
 r.setAttribute('data-motion',s.motion===false?'off':'on');
 if(s.mode==='midnight'){r.classList.add('dark');r.setAttribute('data-theme','lumen');}
}catch(e){}`;

function read(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const p = JSON.parse(raw) as Partial<Appearance>;
    return {
      accent: (ACCENTS.some((a) => a.id === p.accent) ? p.accent : DEFAULT_APPEARANCE.accent) as AccentId,
      mode: p.mode === "midnight" ? "midnight" : "lumen",
      density:
        p.density === "compact" || p.density === "cozy" ? p.density : DEFAULT_APPEARANCE.density,
      scale: (["sm", "md", "lg", "xl"] as const).includes(p.scale as ScaleId)
        ? (p.scale as ScaleId)
        : DEFAULT_APPEARANCE.scale,
      wide: p.wide !== false,
      motion: p.motion !== false,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

type Ctx = { ap: Appearance; set: (patch: Partial<Appearance>) => void; reset: () => void };

const AppearanceContext = createContext<Ctx | null>(null);

export function useAppearance(): Ctx {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance outside provider");
  return ctx;
}

/** Safe variant for pages that may render without the provider. */
export function useAppearanceSafe(): Ctx {
  return useContext(AppearanceContext) ?? { ap: DEFAULT_APPEARANCE, set: () => undefined, reset: () => undefined };
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [ap, setAp] = useState<Appearance>(DEFAULT_APPEARANCE);

  // read after mount (SSR-safe: the boot script already painted the right values)
  useEffect(() => {
    setAp(read());
  }, []);

  useEffect(() => {
    const r = document.documentElement;
    r.setAttribute("data-accent", ap.accent);
    r.setAttribute("data-nx-mode", ap.mode);
    r.setAttribute("data-density", ap.density);
    r.setAttribute("data-scale", ap.scale);
    r.setAttribute("data-wide", ap.wide ? "1" : "0");
    r.setAttribute("data-motion", ap.motion ? "on" : "off");
    if (ap.mode === "midnight") r.classList.add("dark");
    else r.classList.remove("dark");
    try {
      window.localStorage.setItem(KEY, JSON.stringify(ap));
    } catch {
      /* private mode */
    }
  }, [ap]);

  const set = useCallback((patch: Partial<Appearance>) => setAp((p) => ({ ...p, ...patch })), []);
  const reset = useCallback(() => setAp(DEFAULT_APPEARANCE), []);

  const value = useMemo(() => ({ ap, set, reset }), [ap, set, reset]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

/* ──────────────────────────── settings UI ──────────────────────────── */

export function SegRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-[var(--nx-text)]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-[var(--nx-muted)]">{hint}</p>}
      </div>
      <div className="flex flex-none flex-wrap gap-1.5 rounded-2xl border border-[var(--nx-line)] bg-[var(--nx-surface-sunken)] p-1">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={
              value === o.id
                ? "nx-chip nx-chip-accent"
                : "nx-chip border-transparent bg-transparent text-[var(--nx-muted)]"
            }
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-[var(--nx-text)]">{label}</p>
        {hint && <p className="mt-0.5 text-[12px] text-[var(--nx-muted)]">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={
          "relative h-7 w-12 flex-none rounded-full border transition-colors " +
          (value
            ? "border-transparent bg-[var(--nx-accent)]"
            : "border-[var(--nx-line-strong)] bg-[var(--nx-surface-sunken)]")
        }
      >
        <span
          className={
            "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow transition-all " +
            (value ? "start-[26px]" : "start-1")
          }
        />
      </button>
    </div>
  );
}
