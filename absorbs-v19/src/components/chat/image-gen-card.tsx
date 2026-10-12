"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Download, Pencil, RefreshCw, Sparkles, X } from "lucide-react";
import type { ImageAspect, ImageStyle } from "@/lib/image-types";
import { INLINE_IMAGE_ERRORS } from "@/lib/inline-image";

/** State of one in-chat image request (finite state machine: loading -> done | error, error -> loading on retry). */
export interface ImageGenState {
  prompt: string;
  aspect: ImageAspect;
  style: ImageStyle;
  status: "loading" | "done" | "error";
  startedAt: number;
  url?: string;
  ms?: number;
  code?: string;
}

const STEPS = [
  "أحلّل وصفك…",
  "أرسم الخطوط الأولى…",
  "أضيف الألوان والإضاءة…",
  "أُدقّق التفاصيل…",
  "لمسات أخيرة…",
];

const RATIO: Record<ImageAspect, string> = { "1:1": "1 / 1", "16:9": "16 / 9", "9:16": "9 / 16", "4:3": "4 / 3", "3:4": "3 / 4" };
// portrait pictures get a narrower box so they never fill the whole screen height
const WIDTH: Record<ImageAspect, string> = {
  "1:1": "min(100%, 420px)",
  "16:9": "min(100%, 480px)",
  "9:16": "min(100%, 260px)",
  "4:3": "min(100%, 440px)",
  "3:4": "min(100%, 340px)",
};

export function ImageGenCard({
  gen,
  onRetry,
  onEdit,
}: {
  gen: ImageGenState;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  const elapsed = Math.max(0, Math.floor((now - gen.startedAt) / 1000));
  const loaded = loadedUrl !== null && loadedUrl === gen.url;

  // tick once a second only while loading
  useEffect(() => {
    if (gen.status !== "loading") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [gen.status]);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const box = { aspectRatio: RATIO[gen.aspect], width: WIDTH[gen.aspect] } as const;
  const alt = gen.prompt.slice(0, 120);

  if (gen.status === "loading") {
    // asymptotic fake progress: moves fast at first, never reaches 100% before the real image lands
    const pct = Math.round(92 * (1 - Math.exp(-elapsed / 14)));
    return (
      <div role="status" aria-live="polite" aria-label="جارٍ رسم الصورة">
        <div className="imggen-box imggen-shimmer" style={box}>
          <div className="imggen-orb" aria-hidden />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="flex items-center gap-2 text-[13px] font-bold text-white/90">
              <Sparkles className="h-4 w-4 animate-pulse text-amber-300" aria-hidden />
              <span>{STEPS[Math.min(STEPS.length - 1, Math.floor(elapsed / 3))]}</span>
              <span className="ms-auto tabular-nums text-white/60">{elapsed}ث</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-400 transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <p className="mt-2 line-clamp-2 text-[12.5px] text-slate-400">{alt}</p>
      </div>
    );
  }

  if (gen.status === "error") {
    return (
      <div role="alert" className="flex max-w-md items-start gap-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-3.5 text-[14px] text-red-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="leading-7">{INLINE_IMAGE_ERRORS[gen.code ?? "FAILED"] ?? INLINE_IMAGE_ERRORS.FAILED}</p>
          {gen.code !== "UNAUTHENTICATED" && gen.code !== "NO_PROVIDER" && (
            <button type="button" onClick={onRetry} className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-[13px] font-bold text-white transition active:scale-95">
              <RefreshCw className="h-4 w-4" aria-hidden /> إعادة المحاولة
            </button>
          )}
        </div>
      </div>
    );
  }

  const act = "inline-flex h-10 items-center gap-1.5 rounded-xl border border-white/12 bg-white/5 px-3 text-[13px] font-bold text-slate-200 transition active:scale-95 hover:bg-white/10";
  return (
    <div>
      <button
        type="button"
        onClick={() => setZoom(true)}
        aria-label="تكبير الصورة"
        className={`imggen-box block cursor-zoom-in ${loaded ? "" : "imggen-shimmer"}`}
        style={box}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={gen.url}
          alt={alt}
          onLoad={() => setLoadedUrl(gen.url ?? null)}
          decoding="async"
          className={`h-full w-full object-cover transition duration-700 ${loaded ? "opacity-100 blur-0" : "opacity-0 blur-xl"}`}
        />
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <a href={gen.url} download="nexus-image.png" className={act} aria-label="تنزيل الصورة">
          <Download className="h-4 w-4" aria-hidden /> تنزيل
        </a>
        <button type="button" onClick={onRetry} className={act} aria-label="توليد نسخة جديدة">
          <RefreshCw className="h-4 w-4" aria-hidden /> نسخة جديدة
        </button>
        <button type="button" onClick={onEdit} className={act} aria-label="تعديل الصورة في الاستوديو">
          <Pencil className="h-4 w-4" aria-hidden /> تعديل
        </button>
        {gen.ms ? <span className="text-[12px] text-slate-500">{(gen.ms / 1000).toFixed(1)}ث</span> : null}
      </div>

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="عرض الصورة" className="fixed inset-0 z-[90] grid place-items-center bg-black/90 p-3" onClick={() => setZoom(false)}>
          <button type="button" aria-label="إغلاق" className="absolute end-3 top-[max(0.75rem,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white" onClick={() => setZoom(false)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={gen.url} alt={alt} className="max-h-[88dvh] max-w-full rounded-2xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
