import { cn } from "@/lib/utils";

/** The Nexus mark — an "N" drawn as one connected path through nodes, with an AI spark. */
export function NexusMark({ size = 36, className }: { size?: number; className?: string }) {
  const id = `nx${size}${className ? className.length : ""}`.replace(/[^a-z0-9]/gi, "");
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
        <radialGradient id={`${id}-glow`} cx="0.3" cy="0.25" r="0.9">
          <stop stopColor="#6d8dff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6d8dff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-n`} x1="16" y1="14" x2="48" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#9db8ff" />
          <stop offset="1" stopColor="#5b8cff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}-bg)`} />
      <rect width="64" height="64" rx="15" fill={`url(#${id}-glow)`} />
      <rect width="64" height="64" rx="15" fill="none" stroke="rgba(157,184,255,0.25)" />
      <path
        d="M19 47V17l26 30V17"
        stroke={`url(#${id}-n)`}
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="19" cy="17" r="4" fill="#9db8ff" />
      <circle cx="45" cy="47" r="4" fill="#5b8cff" />
      <path d="M49 8l1.6 4.2L55 14l-4.4 1.8L49 20l-1.6-4.2L43 14l4.4-1.8Z" fill="#ffd7a8" />
    </svg>
  );
}

export function Logo({
  compact = false,
  size = 36,
  className,
}: {
  compact?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5 select-none", className)}>
      <div className="relative">
        <NexusMark size={size} />
        <span
          className="absolute inset-0 rounded-[9px] opacity-60 blur-md"
          style={{ background: "radial-gradient(circle at 35% 30%, rgba(109,141,255,0.4), transparent 70%)" }}
          aria-hidden
        />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="text-[17px] font-bold tracking-tight" dir="ltr">
            Nexus<span className="text-(--accent)"> AI</span>
          </div>
          <div className="mt-1 text-[10px] font-medium tracking-[0.22em] text-(--ink-3) uppercase" dir="ltr">
            Intelligence OS
          </div>
        </div>
      )}
    </div>
  );
}
