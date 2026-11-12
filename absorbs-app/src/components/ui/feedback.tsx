"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Toasts ── */
interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}
const ToastContext = createContext<{ toast: (message: string, tone?: ToastItem["tone"]) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const toast = useCallback((message: string, tone: ToastItem["tone"] = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3400);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "glass-strong animate-toast-in flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium shadow-2xl",
              t.tone === "error" ? "text-red-200" : "text-indigo-200",
            )}
            role="status"
          >
            {t.tone === "error" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* ── Loading & empty building blocks ── */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin", className)} />;
}

export function FullPageLoader({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-4 text-white/60">
      <span className="logo-mark h-14 w-14 animate-pulse rounded-[20px]" />
      <p className="flex items-center gap-2 text-sm">
        <Spinner className="h-4 w-4" /> {label}
      </p>
    </div>
  );
}

export function PostSkeleton() {
  return (
    <div className="glass animate-pulse rounded-[28px] p-4">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-full bg-white/10" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-2/5 rounded-full bg-white/10" />
          <div className="h-2.5 w-1/4 rounded-full bg-white/[0.07]" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded-full bg-white/[0.07]" />
        <div className="h-3 w-4/5 rounded-full bg-white/[0.07]" />
      </div>
      <div className="mt-4 h-44 rounded-3xl bg-white/[0.05]" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-[28px] px-6 py-10 text-center">
      <span className="glass-strong mb-1 flex h-14 w-14 items-center justify-center rounded-full text-white/70">{icon}</span>
      <h3 className="text-base font-bold text-white">{title}</h3>
      {description && <p className="max-w-xs text-sm leading-6 text-white/55">{description}</p>}
      {children}
    </div>
  );
}
