"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Crown } from "lucide-react";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { SectionHeading } from "@/components/landing/sections";
import { cn } from "@/lib/utils";

export function Pricing() {
  const { t, locale } = useI18n();
  const [yearly, setYearly] = useState(false);

  const plans = [
    {
      key: "free",
      name: t.pricing.free.name,
      desc: t.pricing.free.desc,
      price: t.pricing.free.price,
      features: t.pricing.free.features,
      cta: t.pricing.free.cta,
      href: "/signup",
      popular: false,
    },
    {
      key: "pro",
      name: t.pricing.pro.name,
      desc: t.pricing.pro.desc,
      price: yearly ? t.pricing.pro.priceYear : t.pricing.pro.price,
      features: t.pricing.pro.features,
      cta: t.pricing.pro.cta,
      href: "/app/upgrade",
      popular: true,
    },
  ];

  return (
    <section id="pricing" className="relative py-24 sm:py-32">
      <div
        aria-hidden
        className="absolute start-1/2 top-0 h-px w-2/3 -translate-x-1/2 glow-line"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          kicker={t.pricing.kicker}
          title={t.pricing.title}
          highlight={t.pricing.highlight}
          sub={t.pricing.sub}
        />

        {/* toggle */}
        <div className="mb-12 flex items-center justify-center gap-3">
          <div className="glass flex rounded-2xl p-1">
            {([false, true] as const).map((y) => (
              <button
                key={String(y)}
                type="button"
                onClick={() => setYearly(y)}
                className={cn(
                  "rounded-xl px-5 py-2 text-sm font-bold transition",
                  yearly === y
                    ? "bg-gradient-to-r from-brand-500 to-aqua-400 text-[#fff] shadow-lg"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {y ? t.pricing.yearly : t.pricing.monthly}
              </button>
            ))}
          </div>
          {yearly && (
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300 ring-1 ring-emerald-400/25">
              {t.pricing.save}
            </span>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((p, i) => (
            <motion.div
              key={p.key}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={cn(
                "relative flex flex-col rounded-2xl p-8 transition-transform duration-300",
                p.popular
                  ? "glass-deep ring-brand shadow-2xl"
                  : "glass"
              )}
            >
              {p.popular && (
                <span className="absolute -top-3.5 start-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-600 rtl:translate-x-1/2 px-4 py-1.5 text-xs font-black text-[#fff] shadow-lg">
                  <Crown className="h-3.5 w-3.5" />
                  {t.pricing.popular}
                </span>
              )}

              <h3 className="text-xl font-black text-white">{p.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{p.desc}</p>

              <div className="my-6 flex items-end gap-2">
                <span className="font-display text-5xl font-black tracking-tight text-white">
                  {p.price}
                </span>
                <span className="pb-1.5 text-sm font-bold text-slate-400">
                  {p.key === "pro"
                    ? yearly
                      ? t.pricing.perYear
                      : t.pricing.perMonth
                    : t.pricing.perMonth}
                </span>
              </div>

              <ul className="mb-8 flex flex-1 flex-col gap-3">
                {p.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm text-slate-300"
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full",
                        p.popular
                          ? "bg-brand-500/20 text-brand-300"
                          : "bg-white/8 text-slate-400"
                      )}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href={p.href}
                className={cn(p.popular ? "btn-primary" : "btn-ghost", "w-full py-3.5")}
              >
                {p.cta}
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          {t.pricing.note}
        </p>
      </div>
    </section>
  );
}
