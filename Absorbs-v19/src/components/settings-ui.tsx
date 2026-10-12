"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Full-page frame used by every settings sub-page. */
export function SettingsFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 lg:py-12">
      <Link
        href="/app/settings"
        className="mb-5 inline-flex items-center gap-1 text-sm font-bold text-slate-400 transition hover:text-white"
      >
        <ChevronRight className="h-4 w-4 rtl:rotate-0 ltr:rotate-180" />
        الإعدادات
      </Link>
      <h1 className="mb-7 text-2xl font-black text-white sm:text-3xl">{title}</h1>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Row({
  icon: Icon,
  title,
  desc,
  href,
  action,
  danger,
}: {
  icon: LucideIcon;
  title: string;
  desc?: string;
  href?: string;
  action?: ReactNode;
  danger?: boolean;
}) {
  const body = (
    <div
      className={cn(
        "glass flex items-center gap-4 rounded-2xl p-4 transition",
        href && "hover:border-white/25 hover:bg-white/[0.06]"
      )}
    >
      <span
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-xl",
          danger ? "bg-rose-500/15 text-rose-300" : "bg-brand-500/15 text-brand-300"
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[15px] font-black", danger ? "text-rose-300" : "text-white")}>{title}</p>
        {desc && <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{desc}</p>}
      </div>
      {action}
      {href && <ChevronRight className="h-4 w-4 text-slate-500 rtl:rotate-180" />}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition",
        on ? "bg-brand-500" : "bg-white/15"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all",
          on ? "start-[1.4rem]" : "start-0.5"
        )}
      />
    </button>
  );
}
