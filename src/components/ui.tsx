"use client";

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Tooltip ─────────────────────────────────────────────────── */

export function Tooltip({
  label,
  children,
  side = "top",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  const pos = {
    top: "bottom-full mb-2 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-2 left-1/2 -translate-x-1/2",
    left: "end-full me-2 top-1/2 -translate-y-1/2",
    right: "start-full ms-2 top-1/2 -translate-y-1/2",
  }[side];

  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "glass-pop pointer-events-none absolute z-50 rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap text-(--ink)",
          "opacity-0 transition-all duration-150 group-hover/tip:opacity-100 group-hover/tip:delay-300",
          pos,
        )}
      >
        {label}
      </span>
    </span>
  );
}

/* ── Buttons ─────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  icon?: ReactNode;
};

export function PrimaryButton({ loading, icon, className, children, disabled, ...props }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "btn-primary inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function GhostButton({ loading, icon, className, children, disabled, ...props }: BtnProps) {
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "glass hover-lift press inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-(--ink-2) hover:text-(--ink) disabled:opacity-45",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  className,
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tooltip label={label}>
      <button
        aria-label={label}
        className={cn(
          "glass hover-lift press grid size-10 cursor-pointer place-items-center rounded-xl text-(--ink-2) hover:text-(--ink)",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/* ── Badge ───────────────────────────────────────────────────── */

export function Badge({ children, tone = "accent" }: { children: ReactNode; tone?: "accent" | "gold" | "plain" }) {
  const styles = {
    accent: "text-(--accent) border-[color-mix(in_srgb,var(--accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]",
    gold: "text-(--gold) border-[color-mix(in_srgb,var(--gold)_40%,transparent)] bg-[color-mix(in_srgb,var(--gold)_12%,transparent)]",
    plain: "text-(--ink-2) border-(--line-2) bg-(--glass-hi)",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-bold tracking-wide", styles)}>
      {children}
    </span>
  );
}

/* ── Dropdown menu ───────────────────────────────────────────── */

export type MenuItem = {
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
};

export function Menu({
  trigger,
  items,
  align = "end",
  width = 190,
}: {
  trigger: ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <span onClick={() => setOpen((v) => !v)} className="inline-flex cursor-pointer">
        {trigger}
      </span>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            style={{ width, transformOrigin: align === "end" ? "top left" : "top right" }}
            className={cn(
              "glass-pop absolute top-full z-50 mt-2 overflow-hidden rounded-2xl p-1.5",
              align === "end" ? "end-0" : "start-0",
            )}
          >
            {items.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "press flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                  item.danger
                    ? "text-red-400 hover:bg-red-500/10"
                    : "text-(--ink-2) hover:bg-(--glass-hi) hover:text-(--ink)",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.button
            aria-label="إغلاق"
            className="absolute inset-0 cursor-default bg-black/55 backdrop-blur-[6px]"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.div
            role="dialog"
            aria-modal
            initial={{ opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn(
              "glass-pop hairline relative max-h-[min(88dvh,760px)] w-full overflow-y-auto rounded-3xl p-6",
              wide ? "max-w-2xl" : "max-w-md"
            )}
          >
            <button
              onClick={onClose}
              aria-label="إغلاق"
              className="glass hover-lift press absolute end-4 top-4 grid size-8 cursor-pointer place-items-center rounded-xl text-(--ink-3) hover:text-(--ink)"
            >
              <X className="size-4" />
            </button>
            {(title || subtitle) && (
              <div className="mb-5 pe-8">
                {title && <h2 className="text-lg font-bold tracking-tight">{title}</h2>}
                {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-(--ink-2)">{subtitle}</p>}
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── Toggle switch ───────────────────────────────────────────── */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "press relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors duration-200",
        checked ? "border-transparent bg-(--accent)" : "border-(--line-2) bg-(--glass-hi)",
      )}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 32 }}
        className={cn(
          "absolute top-1/2 size-4.5 -translate-y-1/2 rounded-full bg-white shadow",
          checked ? "end-[3px]" : "start-[3px] bg-(--ink-3)",
        )}
      />
    </button>
  );
}

/* ── Typing indicator ────────────────────────────────────────── */

export function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1.5 py-1">
      <span className="tdot" />
      <span className="tdot" />
      <span className="tdot" />
    </span>
  );
}
