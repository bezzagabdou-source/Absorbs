"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/**
 * v15 — the real Nexus mark.
 * A nexus = a node that links other nodes, so the glyph is a central core with
 * three orbiting satellites joined by links, cut into a squircle tile. No more
 * bare letter "N". The same geometry is used for the PWA icon and the favicon,
 * so the brand reads identically on the home screen, the tab bar and in-app.
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
      style={{ borderRadius: Math.round(size * 0.26) }}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1b1f3b" />
          <stop offset="0.55" stopColor="#111528" />
          <stop offset="1" stopColor="#0b0e1a" />
        </linearGradient>
        <linearGradient id={`${id}-core`} x1="18" y1="14" x2="46" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8ab4ff" />
          <stop offset="0.5" stopColor="#5b8cff" />
          <stop offset="1" stopColor="#d97757" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.42" r="0.62">
          <stop stopColor="#5b8cff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#5b8cff" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="64" height="64" rx="17" fill={`url(#${id}-bg)`} />
      <rect width="64" height="64" rx="17" fill={`url(#${id}-glow)`} />
      <rect x="0.6" y="0.6" width="62.8" height="62.8" rx="16.4" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1.2" />

      {/* links */}
      <g stroke={`url(#${id}-core)`} strokeWidth="2.6" strokeLinecap="round" opacity="0.9">
        <path d="M32 29V17.5" />
        <path d="M29 34 19.6 42.2" />
        <path d="M35 34l9.4 8.2" />
      </g>

      {/* satellites */}
      <g fill={`url(#${id}-core)`}>
        <circle cx="32" cy="14.5" r="5.2" />
        <circle cx="17" cy="44.5" r="5.2" />
        <circle cx="47" cy="44.5" r="5.2" />
      </g>

      {/* core */}
      <circle cx="32" cy="31.5" r="7.4" fill="#fff" />
      <circle cx="32" cy="31.5" r="7.4" fill={`url(#${id}-core)`} fillOpacity="0.28" />
      <circle cx="32" cy="31.5" r="7.4" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.4" />
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
