"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * v20 — the Nexus logo: a bold "N" drawn as one connected stroke (a path through nodes)
 * plus an AI spark. The same geometry is used for the PWA icon, the favicon and the
 * iOS icon (see public/icons/*.svg + scripts/gen-icons.mjs), so the brand reads
 * identically on the home screen, the tab bar and in-app.
 */
export function NexusMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = "nx";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
      style={{ borderRadius: Math.round(size * 0.24) }}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2a2f6b" />
          <stop offset="0.5" stopColor="#141733" />
          <stop offset="1" stopColor="#090b17" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.3" cy="0.25" r="0.8">
          <stop stopColor="#6d8dff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6d8dff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-n`} x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#9db8ff" />
          <stop offset="1" stopColor="#5b8cff" />
        </linearGradient>
        <linearGradient id={`${id}-sp`} x1="44" y1="6" x2="56" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffd7a8" />
          <stop offset="1" stopColor="#ff7a45" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="15" fill={`url(#${id}-bg)`} />
      <rect width="64" height="64" rx="15" fill={`url(#${id}-glow)`} />
      <rect x="0.6" y="0.6" width="62.8" height="62.8" rx="14.4" stroke="#fff" strokeOpacity="0.16" strokeWidth="1.2" />

      {/* N: one continuous stroke, a node at the start and an AI spark at the end */}
      <path d="M17 47V20.5L43 44.5V18" stroke={`url(#${id}-n)`} strokeWidth="6.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="17" cy="47" r="3.1" fill="#fff" />
      <path
        d="M50.5 9.5c.7 3.7 1.6 4.6 5.3 5.3-3.7.7-4.6 1.6-5.3 5.3-.7-3.7-1.6-4.6-5.3-5.3 3.7-.7 4.6-1.6 5.3-5.3Z"
        fill={`url(#${id}-sp)`}
      />
    </svg>
  );
}

export function Logo({
  size = 36,
  withText = true,
  className,
}: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <NexusMark size={size} className="shadow-[0_6px_20px_-8px_rgba(91,140,255,0.9)]" />
      {withText && (
        <span className="whitespace-nowrap text-base font-bold tracking-tight text-gradient">
          {t.common.appName}
        </span>
      )}
    </span>
  );
}
