import Link from "next/link";
import {
  Activity,
  Brain,
  FileText,
  Flag,
  LifeBuoy,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SystemFooterLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** The six system destinations shared by every public page. */
export const SYSTEM_FOOTER_LINKS: readonly SystemFooterLink[] = [
  { href: "/privacy", label: "سياسة الخصوصية", icon: ShieldCheck },
  { href: "/terms", label: "شروط الخدمة", icon: FileText },
  { href: "/report", label: "إبلاغ عن مشكلة", icon: Flag },
  { href: "/help", label: "المساعدة والإنعاش", icon: LifeBuoy },
  { href: "/activity", label: "نشاط النظام والسرعة", icon: Activity },
  { href: "/memory", label: "الذاكرة والسياق", icon: Brain },
];

/** Unified system footer: one row of contextual links, identical on every public page. */
export function SystemFooter({ className }: { className?: string }) {
  return (
    <nav
      aria-label="روابط النظام"
      className={cn("border-t border-white/10 bg-ink-900/70 px-4 py-6 sm:px-6", className)}
    >
      <ul className="mx-auto grid max-w-5xl grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {SYSTEM_FOOTER_LINKS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-ink-800/60 px-3 py-2 text-sm font-semibold text-slate-300 transition hover:border-brand-500/50 hover:bg-ink-800 hover:text-brand-300"
            >
              <Icon className="h-4 w-4 shrink-0 text-brand-400" aria-hidden />
              <span className="min-w-0 leading-snug">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
