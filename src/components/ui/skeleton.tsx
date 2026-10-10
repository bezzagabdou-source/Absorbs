import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /** Turn the moving shimmer highlight off (a plain pulse is used instead). */
  still?: boolean;
};

/**
 * Base loading block. Size and shape come from className:
 *   <Skeleton className="h-4 w-3/4" />
 *   <Skeleton className="size-10 rounded-full" />
 */
export function Skeleton({ className, still, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-lg",
        still
          ? "animate-pulse bg-slate-200 dark:bg-white/10"
          : [
              "animate-shimmer bg-[length:200%_100%]",
              "bg-[linear-gradient(100deg,rgba(15,23,42,0.07)_30%,rgba(15,23,42,0.16)_50%,rgba(15,23,42,0.07)_70%)]",
              "dark:bg-[linear-gradient(100deg,rgba(255,255,255,0.06)_30%,rgba(125,185,255,0.20)_50%,rgba(255,255,255,0.06)_70%)]",
            ],
        className,
      )}
      {...props}
    />
  );
}

const LINE_WIDTHS = ["w-full", "w-11/12", "w-4/5", "w-2/3"];

/** Placeholder for a streaming AI reply: avatar + a few text lines. */
export function MessageSkeleton({
  lines = 3,
  avatar = true,
  className,
}: {
  lines?: number;
  avatar?: boolean;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading reply"
      className={cn("flex items-start gap-3", className)}
    >
      {avatar && <Skeleton className="size-8 shrink-0 rounded-full" />}
      <div className="flex-1 space-y-2.5 pt-1.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn("h-3.5 rounded-full", LINE_WIDTHS[i % LINE_WIDTHS.length])}
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Placeholder for a list of cards or history rows. */
export function ListSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-label="Loading" className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-16 rounded-2xl"
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </div>
  );
}
