"use client";

import clsx, { type ClassValue } from "clsx";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export function cn(...values: ClassValue[]): string {
  return clsx(values);
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timers.current[id];
    }
  }, []);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
    timers.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
      delete timers.current[id];
    }, 5200);
  }, []);

  useEffect(() => {
    const current = timers.current;
    return () => {
      Object.values(current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return { toasts, push, dismiss };
}

const TOAST_STYLES: Record<ToastKind, { wrap: string; icon: ReactNode }> = {
  success: {
    wrap: "border-emerald-400/25 bg-emerald-950/80 text-emerald-100",
    icon: <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />,
  },
  error: {
    wrap: "border-rose-400/25 bg-rose-950/85 text-rose-100",
    icon: <AlertCircle className="size-4 shrink-0 text-rose-400" />,
  },
  warning: {
    wrap: "border-amber-400/25 bg-amber-950/85 text-amber-100",
    icon: <AlertTriangle className="size-4 shrink-0 text-amber-400" />,
  },
  info: {
    wrap: "border-cyan-400/25 bg-cyan-950/85 text-cyan-100",
    icon: <Info className="size-4 shrink-0 text-cyan-400" />,
  },
};

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(env(safe-area-inset-top),0.75rem)] z-[80] flex flex-col items-center gap-2 px-3">
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.kind];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-[12.5px] leading-5 shadow-xl shadow-black/40 backdrop-blur-xl",
              style.wrap,
            )}
          >
            {style.icon}
            <p className="flex-1">{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-md p-0.5 opacity-60 transition hover:opacity-100"
              aria-label="إغلاق التنبيه"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Buttons / badges
// ---------------------------------------------------------------------------

export function IconButton({
  label,
  onClick,
  children,
  disabled,
  variant = "ghost",
  className,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  disabled?: boolean;
  variant?: "ghost" | "solid" | "danger";
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-transparent text-slate-400 transition",
        "hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50",
        "disabled:cursor-not-allowed disabled:opacity-40",
        variant === "solid" && "border-white/10 bg-white/[0.06] text-white",
        variant === "danger" && "text-rose-400 hover:bg-rose-500/10 hover:text-rose-300",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin", className)} aria-hidden />;
}

export type BadgeTone = "slate" | "emerald" | "amber" | "rose" | "cyan" | "violet" | "orange";

const BADGE_TONES: Record<BadgeTone, string> = {
  slate: "border-white/10 bg-white/[0.04] text-slate-400",
  emerald: "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
  amber: "border-amber-400/20 bg-amber-400/10 text-amber-300",
  rose: "border-rose-400/20 bg-rose-400/10 text-rose-300",
  cyan: "border-cyan-400/20 bg-cyan-400/10 text-cyan-300",
  violet: "border-violet-400/20 bg-violet-400/10 text-violet-300",
  orange: "border-orange-400/20 bg-orange-400/10 text-orange-300",
};

export function Badge({
  children,
  tone = "slate",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium leading-4",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusPill({
  connected,
  checking,
  version,
  onClick,
}: {
  connected: boolean;
  checking: boolean;
  version?: string | null;
  onClick?: () => void;
}) {
  const label = checking ? "جارٍ الفحص" : connected ? "متصل" : "غير متصل";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-live="polite"
      title={connected ? "السيرفر متصل — اضغط للفحص" : "السيرفر غير متصل — اضغط للفحص"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
        connected
          ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/15"
          : checking
            ? "border-amber-400/25 bg-amber-400/10 text-amber-300"
            : "border-rose-400/25 bg-rose-400/10 text-rose-300 hover:bg-rose-400/15",
      )}
    >
      <span className="relative flex size-2">
        {connected && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            connected ? "bg-emerald-400" : checking ? "bg-amber-400" : "bg-rose-400",
          )}
        />
      </span>
      {label}
      {version && <span className="hidden text-[10px] font-normal opacity-60 sm:inline">v{version}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet / modal
// ---------------------------------------------------------------------------

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0c0d12] shadow-2xl shadow-black/60 sm:max-w-lg sm:rounded-3xl">
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[11px] text-slate-500">{subtitle}</p>}
          </div>
          <IconButton label="إغلاق" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
        {footer && <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function formatTime(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    return new Intl.DateTimeFormat("ar-DZ", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleTimeString();
  }
}

export function formatRelative(timestamp?: number): string {
  if (!timestamp) return "";
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "الآن";
  if (diff < hour) {
    const value = Math.floor(diff / minute);
    return value === 1 ? "قبل دقيقة" : `قبل ${value} دقيقة`;
  }
  if (diff < day) {
    const value = Math.floor(diff / hour);
    return value === 1 ? "قبل ساعة" : `قبل ${value} ساعة`;
  }
  const value = Math.floor(diff / day);
  if (value === 1) return "قبل يوم";
  if (value === 2) return "قبل يومين";
  if (value < 11) return `قبل ${value} أيام`;
  return `قبل ${value} يوم`;
}

export function formatContext(limit?: number): string {
  if (!limit) return "";
  if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(1)}M`;
  if (limit >= 1000) return `${Math.round(limit / 1000)}K`;
  return String(limit);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
