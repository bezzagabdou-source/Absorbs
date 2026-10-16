"use client";

/**
 * v18 ATLAS — عناصر مركز التحكم (control primitives)
 * Small, accessible, RTL-aware building blocks shared by /app/control,
 * the knowledge page, the media hub and the files vault.
 */

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function ControlSection({
  icon,
  title,
  desc,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  desc?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn("glass rounded-3xl p-4 sm:p-5", className)}
    >
      <header className="mb-4 flex items-start gap-3">
        {icon && (
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] text-white shadow-lg shadow-black/10">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-black text-white">{title}</h2>
          {desc && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{desc}</p>}
        </div>
      </header>
      <div className="space-y-2.5">{children}</div>
    </motion.section>
  );
}

export function ToggleRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
  badge,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5 transition hover:border-white/16 hover:bg-white/[0.06]",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-slate-100">
          {label}
          {badge && (
            <span className="rounded-full bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] px-2 py-0.5 text-[9.5px] font-black text-white">
              {badge}
            </span>
          )}
        </span>
        {desc && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{desc}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200",
          checked ? "border-transparent bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)]" : "border-white/15 bg-white/10"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 700, damping: 32 }}
          className={cn("absolute top-0.5 size-4.5 rounded-full bg-white shadow", checked ? "left-[calc(100%-1.375rem)]" : "left-0.5")}
          style={{ height: "1.125rem", width: "1.125rem" }}
        />
      </button>
    </label>
  );
}

export function SegmentedRow<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { id: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-bold text-slate-100">{label}</span>
        {desc && <span className="hidden text-[11px] text-slate-400 sm:block">{desc}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={value === o.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11.5px] font-bold transition active:scale-95",
              value === o.id
                ? "border-transparent bg-gradient-to-r from-[var(--nx-accent-from)] to-[var(--nx-accent-to)] text-white shadow-md shadow-black/20"
                : "border-white/12 bg-white/[0.04] text-slate-300 hover:border-white/25 hover:text-white"
            )}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SliderRow({
  label,
  desc,
  value,
  min,
  max,
  step = 0.05,
  format,
  onChange,
}: {
  label: string;
  desc?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-bold text-slate-100">{label}</span>
        <span className="rounded-lg bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--nx-accent-ring)]">
          {format ? format(value) : value.toFixed(2)}
        </span>
      </div>
      {desc && <p className="mt-0.5 text-[11px] text-slate-400">{desc}</p>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="nx-range mt-2.5 w-full"
        aria-label={label}
      />
    </div>
  );
}

export function SelectRow<T extends string>({
  label,
  desc,
  value,
  options,
  onChange,
}: {
  label: string;
  desc?: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-slate-100">{label}</span>
        {desc && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{desc}</span>}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="input-base !h-9 !w-auto min-w-[9rem] !rounded-xl !px-2.5 !text-xs"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AccentPicker({
  value,
  accents,
  onChange,
}: {
  value: string;
  accents: Record<string, { from: string; to: string; name: string }>;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-2.5">
      <span className="text-[13px] font-bold text-slate-100">لون الهوية</span>
      <div className="mt-2 flex flex-wrap gap-2">
        {Object.entries(accents).map(([id, a]) => (
          <button
            key={id}
            type="button"
            title={a.name}
            aria-label={a.name}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className={cn(
              "grid size-9 place-items-center rounded-xl border-2 transition active:scale-90",
              value === id ? "border-white/70 shadow-lg" : "border-white/10 hover:border-white/35"
            )}
            style={{ background: `linear-gradient(135deg, ${a.from}, ${a.to})` }}
          >
            {value === id && <Check className="size-4 text-white drop-shadow" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StatPill({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2">
      {icon && <span className="text-[var(--nx-accent-ring)]">{icon}</span>}
      <span className="min-w-0">
        <span className="block truncate text-[10.5px] text-slate-400">{label}</span>
        <span className="block text-[13px] font-black text-white">{value}</span>
      </span>
    </div>
  );
}
