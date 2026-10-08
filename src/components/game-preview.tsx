"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  Bookmark,
  Check,
  Code2,
  Loader2,
  Copy,
  Download,
  ExternalLink,
  Maximize2,
  Monitor,
  Package,
  RotateCcw,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createZip, downloadBlob, splitHtml } from "@/lib/zip";
import { usePro } from "@/lib/pro-i18n";
import { cn } from "@/lib/utils";

/**
 * Generated pages run in a sandbox: scripts allowed, but NO same-origin access
 * (cannot read the app's cookies / tokens) and a CSP that blocks all network.
 */
const CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src \'none\'">';

function withCsp(html: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${CSP}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${CSP}</head>`);
  return `<!DOCTYPE html><html><head>${CSP}<meta charset="utf-8"></head><body>${html}</body></html>`;
}

const noopSub = () => () => {};
/** true only in the browser, hydration-safe (needed to portal to <body>) */
function useIsClient() {
  return useSyncExternalStore(noopSub, () => true, () => false);
}

/**
 * The sandboxed iframe, with a loading veil so there is never a white/black
 * flash or a half-drawn frame, and NO width transition (that transition was
 * what made the preview jitter while switching phone / tablet / desktop).
 */
function Frame({
  title,
  doc,
  runKey,
  style,
  className,
}: {
  title: string;
  doc: string;
  runKey: number;
  style?: CSSProperties;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  return (
    <div className="relative flex min-h-0 min-w-0 max-w-full justify-center" style={{ width: style?.width ?? "100%", height: style?.height === "100%" ? "100%" : undefined }}>
      {!ready && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-gold-400" />
        </div>
      )}
      <iframe
        key={runKey}
        title={title}
        srcDoc={doc}
        sandbox="allow-scripts allow-pointer-lock allow-modals allow-forms"
        allow="fullscreen"
        loading="eager"
        onLoad={() => setReady(true)}
        className={cn("block max-w-full bg-white", className)}
        style={{ ...style, width: "100%" }}
      />
    </div>
  );
}

export function GamePreview({
  html,
  className,
  height = 460,
}: {
  html: string;
  className?: string;
  height?: number;
}) {
  const p = usePro();
  const [run, setRun] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const doc = useMemo(() => withCsp(html), [html]);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const [flash, setFlash] = useState("");
  const widths = { phone: 390, tablet: 768, desktop: 0 } as const;
  const { authFetch } = useAuth();

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 1800);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      say("تم النسخ");
    } catch {
      say("تعذّر النسخ");
    }
  };
  const openTab = () => {
    const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const save = async () => {
    try {
      const title = (html.match(/<title>([^<]{1,60})<\/title>/i)?.[1] ?? "عمل بدون عنوان").trim();
      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title, html }),
      });
      if (res.ok) say("حُفظ في الاستوديو");
      else if (res.status === 409) say("الاستوديو ممتلئ (40 عمل)");
      else say("تعذّر الحفظ");
    } catch {
      say("تعذّر الحفظ");
    }
  };
  const zip = () => downloadBlob(createZip(splitHtml(html)), "barq-project.zip");

  const download = () => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "barq-game.html";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const full = () => {
    void boxRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const btn =
    "inline-flex items-center gap-1.5 rounded-lg border border-brand-400/25 bg-brand-500/10 px-2.5 py-1.5 text-[11px] font-bold text-slate-300 transition hover:border-gold-400/50 hover:text-[#fff]";

  return (
    <div
      ref={boxRef}
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-brand-400/35 bg-ink-950 shadow-[0_20px_50px_-30px_rgba(47,123,255,0.8)]",
        className
      )}
    >
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-ink-900/97 px-3 py-2 shadow-[0_10px_26px_-24px_rgba(30,41,90,0.6)] backdrop-blur">
        <div className="flex items-center gap-1 rounded-lg bg-black/30 p-0.5">
          {(["preview", "code"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-black transition",
                view === v ? "bg-gradient-to-r from-brand-500 to-aqua-400 text-[#fff]" : "text-slate-400 hover:text-[#fff]"
              )}
            >
              {v === "code" && <Code2 className="h-3.5 w-3.5" />}
              {v === "preview" ? "معاينة" : "الكود"}
            </button>
          ))}
        </div>
        {view === "preview" && (
          <div className="flex items-center gap-0.5" role="group" aria-label="الجهاز">
            {([["phone", Smartphone], ["tablet", Tablet], ["desktop", Monitor]] as const).map(([d, Ic]) => (
              <button
                key={d}
                type="button"
                aria-label={d}
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                className={cn(
                  "grid h-7 w-7 place-items-center rounded-md transition",
                  device === d ? "bg-white/15 text-white" : "text-slate-500 hover:text-white"
                )}
              >
                <Ic className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={btn} onClick={() => setRun((n) => n + 1)}>
            <RotateCcw className="h-3.5 w-3.5" />
            {p.gameReload}
          </button>
          <button type="button" className={btn} onClick={full}>
            <Maximize2 className="h-3.5 w-3.5" />
            {p.gameFull}
          </button>
          <button type="button" className={btn} onClick={openTab}>
            <ExternalLink className="h-3.5 w-3.5" />
            تبويب
          </button>
          <button type="button" className={btn} onClick={copy}>
            <Copy className="h-3.5 w-3.5" />
            نسخ
          </button>
          <button type="button" className={btn} onClick={() => void save()}>
            <Bookmark className="h-3.5 w-3.5" />
            حفظ
          </button>
          <button type="button" className={btn} onClick={download}>
            <Download className="h-3.5 w-3.5" />
            {p.gameDownload}
          </button>
          <button type="button" className={btn} onClick={zip}>
            <Package className="h-3.5 w-3.5" />
            ZIP
          </button>
        </div>
      </div>
      {flash && (
        <p className="flex items-center justify-center gap-1.5 bg-brand-500/15 py-1 text-[11px] font-black text-brand-300">
          <Check className="h-3.5 w-3.5" />
          {flash}
        </p>
      )}
      {view === "code" ? (
        <pre dir="ltr" className="overflow-auto bg-[#0f172a] p-4 text-left text-[11.5px] leading-relaxed text-[#dbe3f5]" style={{ height, minHeight: 280 }}>
          <code>{html}</code>
        </pre>
      ) : (
        <div className="flex flex-1 justify-center bg-[radial-gradient(circle_at_50%_0%,#ffffff,#e9edf9)] p-0 sm:p-3">
          <Frame
            runKey={run}
            title={p.gameTitle}
            doc={doc}
            className={cn(device !== "desktop" && "rounded-[1.6rem] ring-4 ring-brand-400/30")}
            style={{ height, minHeight: 280, width: widths[device] ? `min(100%, ${widths[device]}px)` : "100%" }}
          />
        </div>
      )}
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Full-screen live preview (opens by itself when a build finishes)    */
/* ------------------------------------------------------------------ */

export function FullPreview({ html, onClose }: { html: string; onClose: () => void }) {
  const { authFetch } = useAuth();
  const doc = useMemo(() => withCsp(html), [html]);
  const [run, setRun] = useState(0);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const [flash, setFlash] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const title = useMemo(() => (html.match(/<title>([^<]{1,60})<\/title>/i)?.[1] ?? "معاينة Nexus AI v8.4").trim(), [html]);
  const widths = { phone: 390, tablet: 768, desktop: 0 } as const;
  const isClient = useIsClient();

  // lock the page behind the overlay + Escape closes it
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 1800);
  };
  const ib =
    "grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-200 transition active:scale-90 hover:border-brand-400/50 hover:text-white";

  if (!isClient) return null;

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[200] flex w-screen max-w-full flex-col overflow-hidden bg-ink-950"
      style={{ height: "100dvh" }}
    >
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-black/10 bg-ink-900/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] shadow-[0_10px_30px_-24px_rgba(30,41,90,0.6)] backdrop-blur">
        <button type="button" onClick={onClose} aria-label="إغلاق" className={ib}>
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-white">{title}</p>
          <p className="truncate text-[10.5px] font-bold text-brand-300">معاينة حيّة · شاشة كاملة</p>
        </div>
        <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-1.5">
          <button type="button" aria-label="إعادة تشغيل" onClick={() => setRun((n) => n + 1)} className={ib}>
            <RotateCcw className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label={view === "preview" ? "عرض الكود" : "عرض المعاينة"}
            onClick={() => setView((v) => (v === "preview" ? "code" : "preview"))}
            className={cn(ib, view === "code" && "border-brand-400/60 bg-brand-500/20")}
          >
            <Code2 className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="تبديل الجهاز"
            onClick={() => setDevice((d) => (d === "desktop" ? "phone" : d === "phone" ? "tablet" : "desktop"))}
            className={ib}
          >
            {device === "phone" ? <Smartphone className="h-[18px] w-[18px]" /> : device === "tablet" ? <Tablet className="h-[18px] w-[18px]" /> : <Monitor className="h-[18px] w-[18px]" />}
          </button>
          <button type="button" aria-label="تحميل ZIP" onClick={() => downloadBlob(createZip(splitHtml(html)), "barq-project.zip")} className={cn(ib, "border-amber-300/40 text-amber-200")}>
            <Package className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="حفظ في الاستوديو"
            onClick={async () => {
              try {
                const res = await authFetch("/api/projects", { method: "POST", body: JSON.stringify({ title, html }) });
                say(res.ok ? "حُفظ في الاستوديو" : res.status === 409 ? "الاستوديو ممتلئ" : "تعذّر الحفظ");
              } catch {
                say("تعذّر الحفظ");
              }
            }}
            className={ib}
          >
            <Bookmark className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="نسخ الكود"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(html);
                say("تم النسخ");
              } catch {
                say("تعذّر النسخ");
              }
            }}
            className={ib}
          >
            <Copy className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="فتح في تبويب"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([doc], { type: "text/html;charset=utf-8" }));
              window.open(url, "_blank", "noopener");
              setTimeout(() => URL.revokeObjectURL(url), 60_000);
            }}
            className={ib}
          >
            <ExternalLink className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="ملء الشاشة"
            onClick={() => void boxRef.current?.requestFullscreen?.().catch(() => undefined)}
            className={ib}
          >
            <Maximize2 className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {flash && (
        <p className="flex items-center justify-center gap-1.5 bg-brand-500/20 py-1 text-[11px] font-black text-brand-300">
          <Check className="h-3.5 w-3.5" />
          {flash}
        </p>
      )}

      {view === "code" ? (
        <pre dir="ltr" className="min-h-0 flex-1 overflow-auto bg-[#0f172a] p-4 text-left text-[12px] leading-relaxed text-[#dbe3f5]">
          <code>{html}</code>
        </pre>
      ) : (
        <div className="flex min-h-0 flex-1 justify-center bg-[radial-gradient(circle_at_50%_0%,#ffffff,#e9edf9)] sm:p-3">
          <Frame
            runKey={run}
            title={title}
            doc={doc}
            className={cn("h-full", device !== "desktop" && "rounded-[1.6rem] ring-4 ring-brand-400/30")}
            style={{ height: "100%", width: widths[device] ? `min(100%, ${widths[device]}px)` : "100%" }}
          />
        </div>
      )}
    </div>,
    document.body
  );
}
