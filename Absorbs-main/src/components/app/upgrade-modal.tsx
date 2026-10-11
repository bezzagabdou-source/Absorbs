"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Crown, X } from "lucide-react";

type Lang = "ar" | "fr" | "en";

const TXT: Record<Lang, { title: string; body: (model: string) => string; cta: string; later: string }> = {
  en: {
    title: "Unlock Pro models",
    body: (m) => `${m} is part of the Pro plan. Upgrade to use Grok and OpenRouter models (Claude, GPT-4o and more).`,
    cta: "Upgrade to Pro",
    later: "Maybe later",
  },
  fr: {
    title: "Débloquez les modèles Pro",
    body: (m) => `${m} fait partie du plan Pro. Passez à Pro pour utiliser Grok et les modèles OpenRouter (Claude, GPT-4o et plus).`,
    cta: "Passer à Pro",
    later: "Plus tard",
  },
  ar: {
    title: "افتح نماذج Pro",
    body: (m) => `${m} متاح في خطة Pro. رقِّ حسابك لاستخدام Grok ونماذج OpenRouter (Claude وGPT-4o وغيرها).`,
    cta: "الترقية إلى Pro",
    later: "لاحقًا",
  },
};

export function UpgradeModal({
  open,
  modelLabel,
  locale,
  onClose,
}: {
  open: boolean;
  modelLabel: string;
  locale: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const tx = TXT[(locale === "ar" || locale === "fr" ? locale : "en") as Lang];

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={tx.title}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm rounded-3xl border border-amber-300/25 bg-ink-900 p-5 text-center shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute end-3 top-3 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-amber-400/15 text-amber-300">
          <Crown className="h-6 w-6" />
        </div>
        <h2 className="mt-3 text-lg font-black text-slate-100">{tx.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{tx.body(modelLabel)}</p>
        <Link href="/app/upgrade" className="btn-primary mt-4 w-full justify-center px-5 py-2.5 text-sm">
          {tx.cta}
        </Link>
        <button type="button" onClick={onClose} className="mt-2 w-full rounded-xl py-2 text-xs font-bold text-slate-400 hover:text-slate-200">
          {tx.later}
        </button>
      </div>
    </div>
  );
}
