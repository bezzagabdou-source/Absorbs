"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Gift,
  MessagesSquare,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { motion, useInView } from "framer-motion";
import { useI18n } from "@/lib/i18n";
import { TOOLS } from "@/lib/tools";
import { ToolCard } from "@/components/tool-card";
import { cn } from "@/lib/utils";

/* ---------------- shared section heading ---------------- */

export function SectionHeading({
  kicker,
  title,
  highlight,
  sub,
}: {
  kicker: string;
  title: string;
  highlight: string;
  sub?: string;
}) {
  return (
    <div className="mb-12 max-w-2xl">
      <motion.span
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mb-3 inline-block text-sm font-semibold text-brand-400"
      >
        {kicker}
      </motion.span>
      <motion.h2
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.55, delay: 0.06 }}
        className="text-3xl font-black tracking-tight text-white sm:text-5xl"
      >
        {title}{" "}
        <span className="text-gradient">{highlight}</span>
      </motion.h2>
      {sub && (
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mt-4 text-slate-400 sm:text-lg"
        >
          {sub}
        </motion.p>
      )}
    </div>
  );
}

/* ---------------- marquee ---------------- */

export function Marquee() {
  const { t } = useI18n();
  const items = [...t.marquee, ...t.marquee];
  return (
    <section className="relative overflow-hidden border-y border-white/5 bg-white/[0.015] py-5">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 start-0 z-10 w-24"
        style={{ background: "linear-gradient(to right, #050505, transparent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 end-0 z-10 w-24"
        style={{ background: "linear-gradient(to left, #050505, transparent)" }}
      />
      <div className="flex w-max animate-marquee items-center gap-8 [animation-direction:reverse]">
        {items.map((item, i) => (
          <span
            key={i}
            className="flex items-center gap-8 whitespace-nowrap text-sm font-bold text-slate-400"
          >
            {item}
            <span className="h-1 w-1 rounded-full bg-slate-600" />
          </span>
        ))}
      </div>
    </section>
  );
}

/* ---------------- features ---------------- */

const FEATURE_ICONS: LucideIcon[] = [
  MessagesSquare,
  Clock,
  ShoppingBag,
  ShieldCheck,
  Smartphone,
  Gift,
];

export function Features() {
  const { t } = useI18n();
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          kicker={t.features.kicker}
          title={t.features.title}
          highlight={t.features.highlight}
          sub={t.features.sub}
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.items.map((f, i) => {
            const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
            const big = i === 0;
            return (
              <motion.div
                key={f.t}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.55, delay: (i % 3) * 0.08 }}
                className={cn(
                  "group glass relative overflow-hidden rounded-3xl p-7 transition-all duration-300 hover:border-brand-400/30",
                  big && "sm:col-span-2 lg:col-span-1"
                )}
              >
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-400/25 bg-brand-500/12 text-brand-300 transition-transform duration-300">
                  <Icon className="h-6 w-6" strokeWidth={2} />
                </span>
                <h3 className="mb-2 text-lg font-extrabold text-white">{f.t}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{f.d}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------- tools showcase ---------------- */

export function ToolsShowcase() {
  const { t } = useI18n();
  return (
    <section id="tools" className="relative py-24 sm:py-32">
      <div
        aria-hidden
        className="absolute start-1/2 top-0 h-px w-2/3 -translate-x-1/2 glow-line"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <SectionHeading
          kicker={t.toolsSec.kicker}
          title={t.toolsSec.title}
          highlight={t.toolsSec.highlight}
          sub={t.toolsSec.sub}
        />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {TOOLS.map((tool, i) => (
            <ToolCard
              key={tool.id}
              tool={tool}
              index={i}
              suffix={t.toolsSec.open}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- stats ---------------- */

function CountUp({ target, active }: { target: number; active: boolean }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const dur = 1700;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target]);
  return <>{n.toLocaleString("en-US")}</>;
}

export function Stats() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const stats: { value: number; suffix: string; label: string; sub: string }[] = [
    { value: 12500, suffix: "+", label: t.stats.users, sub: t.stats.usersLabel },
    { value: 380000, suffix: "+", label: t.stats.gens, sub: t.stats.gensLabel },
    { value: 10, suffix: "", label: t.stats.tools, sub: t.stats.toolsLabel },
    { value: 4, suffix: "", label: t.stats.langs, sub: t.stats.langsLabel },
  ];

  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div
          ref={ref}
          className="glass grid grid-cols-2 gap-y-10 rounded-2xl px-6 py-12 text-center lg:grid-cols-4"
        >
          {stats.map((s) => (
            <div key={s.label}>
              <div className="font-display text-4xl font-black text-white sm:text-5xl">
                <CountUp target={s.value} active={inView} />
                <span className="text-gradient">{s.suffix}</span>
              </div>
              <div className="mt-2 text-sm font-extrabold text-slate-200">
                {s.label}
              </div>
              <div className="text-xs text-slate-500">{s.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
