"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { cn } from "@/lib/utils";

export function Navbar() {
  const { t, dir } = useI18n();
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { href: "#features", label: t.nav.features },
    { href: "#tools", label: t.nav.tools },
    { href: "#pricing", label: t.nav.pricing },
    { href: "#faq", label: t.nav.faq },
  ];

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] backdrop-blur-md transition-colors duration-200",
        scrolled
          ? "border-b border-aqua-300/10 bg-ink-950/85"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <nav
          className="flex items-center justify-between py-3"
        >
          <Link href="/" aria-label="برق">
            <Logo />
          </Link>

          <div className="hidden items-center gap-1 lg:flex">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="hidden items-center gap-2.5 lg:flex">
            <LanguageSwitcher compact />
            {user ? (
              <Link href="/app" className="btn-primary">
                {t.nav.openApp}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="rounded-xl px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/5"
                >
                  {t.nav.login}
                </Link>
                <Link href="/signup" className="btn-primary">
                  {t.nav.startFree}
                </Link>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <LanguageSwitcher compact />
            <button
              type="button"
              aria-label="Menu"
              onClick={() => setOpen((o) => !o)}
              className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-200"
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </nav>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="glass-deep mt-2 overflow-hidden rounded-2xl p-3 lg:hidden"
            >
              <div className="flex flex-col">
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="rounded-xl px-4 py-3 text-sm font-bold text-slate-200 transition hover:bg-white/5"
                  >
                    {l.label}
                  </a>
                ))}
                <div className="mt-2 flex gap-2 border-t border-white/10 pt-3">
                  {user ? (
                    <Link href="/app" className="btn-primary w-full">
                      {t.nav.openApp}
                    </Link>
                  ) : (
                    <>
                      <Link href="/login" className="btn-ghost flex-1" dir={dir}>
                        {t.nav.login}
                      </Link>
                      <Link href="/signup" className="btn-primary flex-1">
                        {t.nav.startFree}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
