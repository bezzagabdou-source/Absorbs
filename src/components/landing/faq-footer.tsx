"use client";

import { useState } from "react";
import Link from "next/link";
import { AtSign, ChevronDown, Heart, Mail, Play, Send } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { SectionHeading } from "@/components/landing/sections";
import { Logo } from "@/components/logo";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SystemFooter } from "@/components/system-footer";
import { cn } from "@/lib/utils";

export function Faq() {
  const { t } = useI18n();
  const [open, setOpen] = useState<number>(0);

  return (
    <section id="faq" className="relative py-24 sm:py-32">
      <div
        aria-hidden
        className="absolute start-1/2 top-0 h-px w-2/3 -translate-x-1/2 glow-line"
      />
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <SectionHeading
          kicker={t.faq.kicker}
          title={t.faq.title}
          highlight={t.faq.highlight}
        />
        <div className="flex flex-col gap-3.5">
          {t.faq.items.map((item, i) => {
            const isOpen = open === i;
            return (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className={cn(
                  "glass overflow-hidden rounded-2xl transition-colors",
                  isOpen && "border-brand-400/30"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start"
                >
                  <span className="text-sm font-extrabold text-white sm:text-base">
                    {item.q}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-brand-300 transition-transform duration-300",
                      isOpen && "rotate-180"
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28 }}
                    >
                      <p className="px-6 pb-6 text-sm leading-relaxed text-slate-400">
                        {item.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function CtaBand() {
  const { t } = useI18n();
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="lattice relative overflow-hidden rounded-2xl bg-brand-700 px-8 py-16 text-center sm:py-20"
        >
          <h2 className="relative text-3xl font-black text-white sm:text-5xl">
            {t.cta.title}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-slate-300 sm:text-lg">
            {t.cta.sub}
          </p>
          <Link
            href="/signup"
            className="btn-primary relative mt-9 px-9 py-4 text-base"
          >
            {t.cta.btn}
          </Link>
          <p className="relative mt-4 text-xs font-semibold text-slate-400">
            {t.cta.note}
          </p>
        </motion.div>
      </div>
    </section>
  );
}

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  const productLinks = [
    { href: "#features", label: t.footer.features },
    { href: "/tools", label: t.footer.tools },
    { href: "#pricing", label: t.footer.pricing },
  ];

  return (
    <footer className="relative border-t border-white/5 bg-ink-950/80 pt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-12 pb-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              {t.footer.tagline}
            </p>
            <div className="mt-6 flex gap-2.5">
              {[
                { icon: AtSign, href: "https://instagram.com", label: "Instagram" },
                { icon: Send, href: "https://t.me", label: "Telegram" },
                { icon: Play, href: "https://tiktok.com", label: "TikTok" },
                { icon: Mail, href: "mailto:abdiubz0@gmail.com", label: "Email" },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:border-brand-400/40 hover:text-brand-300"
                >
                  <s.icon className="h-4.5 w-4.5" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-black text-white">
              {t.footer.product}
            </h4>
            <ul className="space-y-2.5">
              {productLinks.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="text-sm text-slate-400 transition hover:text-brand-300"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link
                  href="/app"
                  className="text-sm text-slate-400 transition hover:text-brand-300"
                >
                  {t.nav.openApp}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-black text-white">
              {t.footer.company}
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a
                  href="/#features"
                  className="text-sm text-slate-400 transition hover:text-brand-300"
                >
                  {t.footer.about}
                </a>
              </li>
              <li>
                <a
                  href="mailto:abdiubz0@gmail.com"
                  className="text-sm text-slate-400 transition hover:text-brand-300"
                >
                  {t.footer.contact}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-black text-white">
              {t.common.language}
            </h4>
            <LanguageSwitcher />
            <div className="glass mt-6 rounded-2xl p-4">
              <p className="text-xs leading-relaxed text-slate-400">
                {t.app.disclaimer}
              </p>
            </div>
          </div>
        </div>

        <SystemFooter className="-mx-4 sm:-mx-6" />

        <div className="flex flex-col items-center justify-between gap-4 border-t border-white/5 py-7 sm:flex-row">
          <p className="text-xs text-slate-500">
            © {year} Nexus AI v8.4. {t.footer.rights}
          </p>
          <p className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
            {t.footer.madeIn}
            <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
          </p>
        </div>
      </div>
    </footer>
  );
}
