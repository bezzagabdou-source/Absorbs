"use client";

import { useRef, useState } from "react";
import { Crown, Gamepad2, Maximize2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useCredits } from "@/components/app/app-shell";

/**
 * Barq Storm — the built-in arcade game.
 * It lives in /public/arcade/barq-storm.html and is mounted in a plain iframe
 * (same origin, so best scores persist in localStorage). Pro unlocks every
 * level and boss; free accounts play the first three levels.
 */
export default function ArcadePage() {
  const { profile } = useCredits();
  const isPro = profile?.plan === "pro";
  const boxRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  // wait for the profile so the iframe never reloads when the plan arrives
  const ready = profile !== null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col gap-3 px-3 py-3 sm:px-6 sm:py-5">
      <header className="flex min-w-0 shrink-0 items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-2 text-lg font-black text-white sm:text-2xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-gold-200 to-gold-500 text-[#2a1700]">
            <Gamepad2 className="h-5 w-5" />
          </span>
          <span className="truncate">
            <span className="gold-text">عاصفة برق</span>
          </span>
        </h1>
        <div className="flex shrink-0 items-center gap-2">
          {!isPro && (
            <Link href="/app/upgrade" className="btn-gold !rounded-xl !px-3 !py-2 text-xs">
              <Crown className="h-3.5 w-3.5" />
              افتح كل المراحل
            </Link>
          )}
          <button
            type="button"
            aria-label="إعادة تحميل اللعبة"
            onClick={() => setRun((n) => n + 1)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-brand-400/30 bg-brand-500/10 text-slate-200 transition active:scale-90"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="ملء الشاشة"
            onClick={() => void boxRef.current?.requestFullscreen?.().catch(() => undefined)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-brand-400/30 bg-brand-500/10 text-slate-200 transition active:scale-90"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div
        ref={boxRef}
        className="relative mx-auto min-h-0 w-full max-w-[520px] flex-1 overflow-hidden rounded-3xl border border-brand-400/35 bg-ink-950 shadow-[0_30px_80px_-40px_rgba(47, 123, 255,0.9)]"
      >
        {ready ? (
          <iframe
            key={`${run}-${isPro ? "pro" : "free"}`}
            title="عاصفة برق"
            src={`/arcade/barq-storm.html?pro=${isPro ? 1 : 0}`}
            allow="fullscreen; autoplay"
            className="absolute inset-0 h-full w-full border-0 bg-ink-950"
          />
        ) : (
          <div className="shimmer-line absolute inset-0" />
        )}
      </div>
    </div>
  );
}
