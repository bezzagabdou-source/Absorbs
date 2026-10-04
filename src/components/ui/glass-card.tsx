"use client";

import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

type Glow = "none" | "brand" | "aqua" | "gold";

export interface GlassCardProps extends Omit<HTMLMotionProps<"div">, "children"> {
  /** Plain React children (framer-motion's MotionValue children are not allowed here). */
  children?: ReactNode;
  /** Coloured aura behind the card. */
  glow?: Glow;
  /** Lift the card slightly on hover. Use for clickable cards only. */
  interactive?: boolean;
  /** Stagger index: delays the entrance so lists fade in one after another. */
  index?: number;
  /** Skip the entrance animation. */
  static?: boolean;
}

const GLOW: Record<Glow, string> = {
  none: "",
  brand:
    "shadow-[0_8px_40px_-12px_rgba(47,123,255,0.35)] dark:shadow-[0_0_48px_-10px_rgba(47,123,255,0.45)]",
  aqua:
    "shadow-[0_8px_40px_-12px_rgba(6,182,212,0.35)] dark:shadow-[0_0_48px_-10px_rgba(34,211,238,0.35)]",
  gold:
    "shadow-[0_8px_40px_-12px_rgba(245,158,11,0.40)] dark:shadow-[0_0_48px_-10px_rgba(251,191,36,0.40)]",
};

/**
 * Frosted-glass surface with a faint top-edge highlight.
 * Works in light and dark mode (needs the `dark` class on <html>).
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    { className, glow = "none", interactive, index = 0, static: isStatic, children, ...props },
    ref,
  ) {
    return (
      <motion.div
        ref={ref}
        initial={isStatic ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: Math.min(index, 8) * 0.06, ease: [0.22, 1, 0.36, 1] }}
        whileHover={interactive ? { y: -2 } : undefined}
        whileTap={interactive ? { scale: 0.99 } : undefined}
        className={cn(
          "relative overflow-hidden rounded-2xl border backdrop-blur-md",
          "border-slate-900/10 bg-white/70 text-slate-900",
          "dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100",
          interactive && "cursor-pointer transition-colors hover:bg-white/90 dark:hover:bg-white/[0.07]",
          GLOW[glow],
          className,
        )}
        {...props}
      >
        {/* top-edge sheen */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/25"
        />
        {children}
      </motion.div>
    );
  },
);
