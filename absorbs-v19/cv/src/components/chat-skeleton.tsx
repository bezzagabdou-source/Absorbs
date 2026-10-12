import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the chat page streams in (Suspense fallback).
 * Replaces the old `fallback={null}` that left a blank white screen on slow phones.
 */
export function ChatSkeleton() {
  return (
    <div
      className="flex min-h-[var(--app-h,100dvh)] w-full flex-col justify-between gap-6 p-4"
      role="status"
      aria-busy="true"
      aria-label="جارٍ التحميل"
    >
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-2/3 rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-10 w-1/2 self-end rounded-2xl" />
      </div>
      <Skeleton className="h-28 w-full rounded-3xl" />
    </div>
  );
}
