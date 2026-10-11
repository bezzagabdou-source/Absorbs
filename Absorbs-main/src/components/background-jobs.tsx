"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { MEGA_SERVER_STATE, megaCanAutoResume, megaGet, megaInit, megaStart, megaSubscribe } from "@/lib/mega-store";
import { toolSubscribe, toolsRunning, toolsSignature } from "@/lib/tool-store";

/**
 * Mounted once in the app layout. Shows a small floating badge while a build is running in the
 * background (so leaving the Studio never feels like losing it) and resumes a project that was
 * cut by a page reload / closed tab.
 */
export function BackgroundJobs() {
  const { user, authFetch } = useAuth();
  const pathname = usePathname();
  const mega = useSyncExternalStore(megaSubscribe, megaGet, () => MEGA_SERVER_STATE);
  useSyncExternalStore(toolSubscribe, toolsSignature, () => "");
  const tools = toolsRunning();

  useEffect(() => {
    if (!user) return;
    void megaInit().then(() => {
      if (megaCanAutoResume()) {
        const j = megaGet().job;
        if (j) void megaStart(authFetch, { ...j, status: "building", note: "" });
      }
    });
  }, [user, authFetch]);

  const items: { key: string; href: string; label: string }[] = [];
  if (mega.running && mega.job) {
    const total = mega.job.plan?.files.length ?? 0;
    const done = Object.keys(mega.job.files).length;
    items.push({
      key: "mega",
      href: "/app/studio/build",
      label: total > 0 ? `يبني مشروعاً ضخماً… ${done}/${total}` : "يخطّط مشروعاً ضخماً…",
    });
  }
  for (const t of tools) {
    items.push({ key: t.id, href: `/app/tools/${t.id}`, label: `يولّد في الخلفية… ${(t.chars / 1024).toFixed(0)} KB` });
  }
  const visible = items.filter((i) => pathname !== i.href);
  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3">
      {visible.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          className="pointer-events-auto inline-flex max-w-full items-center gap-2 rounded-full border border-amber-300/40 bg-[#0b1220]/95 px-4 py-2 text-xs font-bold text-amber-200 shadow-lg backdrop-blur"
        >
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span className="truncate">{i.label}</span>
        </Link>
      ))}
    </div>
  );
}
