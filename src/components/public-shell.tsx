import Link from "next/link";
import { Logo } from "@/components/logo";

/** Light server-rendered frame for public (indexable) pages. */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh]">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" aria-label="برق">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/tools" className="btn-ghost !px-4 !py-2 text-sm">
            الأدوات
          </Link>
          <Link href="/signup" className="btn-primary !px-4 !py-2 text-sm">
            ابدأ مجانًا
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-20 sm:px-6">{children}</main>
      <footer className="border-t border-white/10 py-8 text-center text-sm text-slate-500">
        <Link href="/" className="hover:text-slate-300">
          برق
        </Link>{" "}
        · صُنع في الجزائر 🇩🇿
      </footer>
    </div>
  );
}
