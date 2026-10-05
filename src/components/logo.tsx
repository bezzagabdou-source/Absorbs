"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

/** Brand mark: an electric blue-to-gold tile with the Arabic letter "ب". */
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
      <span
        aria-hidden
        className="grid shrink-0 place-items-center bg-gradient-to-br from-brand-500 via-aqua-500 to-gold-400 font-bold leading-none text-white shadow-[0_6px_20px_-6px_rgba(0,180,255,0.9),inset_0_1px_0_rgba(255,255,255,0.35)]"
        style={{
          width: size,
          height: size,
          borderRadius: Math.round(size * 0.24),
          fontSize: size * 0.62,
          paddingBottom: size * 0.04,
        }}
      >
        N
      </span>
      {withText && (
        <span className="whitespace-nowrap text-base font-bold tracking-tight text-gradient">
          {t.common.appName}
        </span>
      )}
    </span>
  );
}
