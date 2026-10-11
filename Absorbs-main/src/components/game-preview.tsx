"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
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
  Wand2,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { createZip, downloadBlob, splitHtml } from "@/lib/zip";
import { usePro } from "@/lib/pro-i18n";
import { NEXUS_DB_SHIM } from "@/lib/game-bundle";
import { cn } from "@/lib/utils";

/**
 * Generated pages run in a sandbox: scripts allowed, but NO same-origin access
 * (cannot read the app's cookies / tokens) and a CSP that blocks all network.
 */
const CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com; worker-src blob: data:; child-src blob:; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src \'none\'">';

/**
 * RUNTIME GUARD — injected into every previewed document.
 *
 * The "black box" glitch: when generated code crashed before drawing anything,
 * the iframe stayed a dead black/empty rectangle. This guard:
 *   1. catches window errors + unhandled rejections,
 *   2. if the page produced NO visible content, paints a styled crash card in
 *      Arabic instead of the black box (never a dead rectangle),
 *   3. reports every failure to the parent via postMessage so the host app can
 *      offer the one-click AI auto-repair,
 *   4. offers an in-frame "retry" that asks the parent to re-run the document,
 *   5. a boot watchdog catches the "script did nothing at all" case.
 */
const GUARD = `<script>(function(){
"use strict";
if (window.__nexusGuard) return; window.__nexusGuard = true;
var card = null, state = { errors: 0, reported: false };
function tellParent(kind, msg, fatal){
  try { parent.postMessage({ __nexus: 1, type: "preview-error", kind: kind, message: String(msg).slice(0, 600), fatal: !!fatal }, "*"); } catch (e) {}
}
function hasContent(){
  var b = document.body;
  if (!b) return false;
  if (b.querySelector && b.querySelector("canvas, svg, img, video, iframe, table, form, button, input")) return true;
  if ((b.innerText || "").replace(/\\s+/g, "").length > 0) return true;
  var kids = b.children;
  for (var i = 0; i < kids.length; i++) {
    var el = kids[i];
    if (el.id === "__nexus-crash") continue;
    var r = el.getBoundingClientRect();
    if (r.width > 8 && r.height > 8) return true;
  }
  return false;
}
function crashCard(title, msg, detail){
  if (card || hasContent()) return;
  card = document.createElement("div");
  card.id = "__nexus-crash";
  card.setAttribute("style", "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:radial-gradient(120% 120% at 50% 0%,#101a3f 0%,#070b1e 60%,#04060f 100%);color:#e8eeff;font-family:'Segoe UI',Tahoma,Arial,sans-serif;direction:rtl;padding:24px;");
  var box = document.createElement("div");
  box.setAttribute("style","max-width:430px;width:100%;text-align:center;background:rgba(255,255,255,0.055);border:1px solid rgba(120,150,255,0.22);border-radius:24px;padding:30px 26px;box-shadow:0 30px 80px -30px rgba(0,0,0,0.9);backdrop-filter:blur(8px);");
  var icon = document.createElement("div");
  icon.setAttribute("style","width:56px;height:56px;margin:0 auto 14px;border-radius:18px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#f59e0b,#f43f5e);");
  icon.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/></svg>';
  var h = document.createElement("div");
  h.setAttribute("style","font-size:19px;font-weight:800;margin-bottom:8px;");
  h.textContent = title;
  var m = document.createElement("div");
  m.setAttribute("style","font-size:13.5px;line-height:1.7;color:#b9c6ef;margin-bottom:6px;");
  m.textContent = msg;
  var d = document.createElement("div");
  d.setAttribute("style","display:" + (detail ? "block" : "none") + ";direction:ltr;text-align:left;font-size:11px;line-height:1.5;color:#fda4af;background:rgba(244,63,94,0.10);border:1px solid rgba(244,63,94,0.25);border-radius:10px;padding:8px 10px;margin:10px 0 16px;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:92px;overflow:auto;");
  d.textContent = detail || "";
  var row = document.createElement("div");
  row.setAttribute("style","display:flex;gap:8px;justify-content:center;");
  var retry = document.createElement("button");
  retry.setAttribute("style","cursor:pointer;border:1px solid rgba(255,255,255,0.2);background:rgba(255,255,255,0.09);color:#fff;font-family:inherit;font-size:13px;font-weight:700;border-radius:12px;padding:9px 18px;");
  retry.textContent = "إعادة التشغيل";
  retry.onclick = function(){ try { parent.postMessage({ __nexus: 1, type: "preview-retry" }, "*"); } catch (e) {} if (card) { card.remove(); card = null; } };
  row.appendChild(retry);
  box.appendChild(icon); box.appendChild(h); box.appendChild(m); box.appendChild(d); box.appendChild(row);
  card.appendChild(box);
  (document.body || document.documentElement).appendChild(card);
}
window.addEventListener("error", function(e){
  state.errors++;
  var where = e.filename ? (" [" + e.filename.split("/").pop() + ":" + e.lineno + "]") : "";
  var msg = (e.message || "خطأ برمجي غير معروف") + where;
  tellParent("error", msg, !hasContent());
  crashCard("تعذّر تشغيل العمل", "الكود فيه خطأ برمجي منع التشغيل. جرّب زر «إصلاح تلقائي» في الأعلى ليصلحه الذكاء الاصطناعي.", msg);
}, true);
window.addEventListener("unhandledrejection", function(e){
  state.errors++;
  var r = e.reason;
  var msg = (r && (r.message || r.toString())) || "خطأ غير متزامن";
  tellParent("promise", msg, !hasContent());
  crashCard("تعذّر تشغيل العمل", "حدث خطأ غير متزامن أثناء التشغيل.", msg);
});
setTimeout(function(){
  if (!hasContent() && state.errors === 0) {
    crashCard("المعاينة فارغة", "الكود لم ينتج أي محتوى مرئي. استخدم «إصلاح تلقائي» ليُبنى العمل من جديد.", "");
    tellParent("empty", "الصفحة فارغة — لم يُرسم أي محتوى", true);
  }
}, 2600);
})();</script>`;

function withCsp(html: string): string {
  const inject = CSP + GUARD + NEXUS_DB_SHIM;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${inject}</head>`);
  return `<!DOCTYPE html><html><head>${inject}<meta charset="utf-8"></head><body>${html}</body></html>`;
}

const noopSub = () => () => {};
/** true only in the browser, hydration-safe (needed to portal to <body>) */
function useIsClient() {
  return useSyncExternalStore(noopSub, () => true, () => false);
}

/* ------------------------------------------------------------------ */
/* Runtime-error state shared by both previews                          */
/* ------------------------------------------------------------------ */

type PreviewError = { kind: string; message: string } | null;

/** Listens for guard messages coming out of the sandboxed frame. */
function usePreviewErrors(): {
  error: PreviewError;
  retryTick: number;
  clear: () => void;
} {
  const [error, setError] = useState<PreviewError>(null);
  const [retryTick, setRetryTick] = useState(0);
  const { authFetch } = useAuth();
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __nexus?: number; type?: string; kind?: string; message?: string; id?: number; op?: string; game?: string; slot?: string; data?: unknown } | null;
      if (!d || d.__nexus !== 1) return;
      // NexusDB bridge: the sandboxed game cannot reach the network, the host saves for it (Postgres via /api/saves)
      if (d.type === "db") {
        const reply = (body: Record<string, unknown>) => {
          try {
            (e.source as Window | null)?.postMessage({ __nexus: 1, type: "db-reply", id: d.id, ...body }, "*");
          } catch {
            /* the frame is gone */
          }
        };
        const game = encodeURIComponent(String(d.game ?? "game").slice(0, 64));
        const slot = encodeURIComponent(String(d.slot ?? "auto").slice(0, 64));
        void (async () => {
          try {
            if (d.op === "save") {
              const r = await authFetch("/api/saves", { method: "POST", body: JSON.stringify({ game: d.game, slot: d.slot, data: d.data }) });
              reply({ ok: r.ok });
            } else if (d.op === "load") {
              const r = await authFetch(`/api/saves?game=${game}&slot=${slot}`);
              const j = r.ok ? ((await r.json()) as { save?: { data?: unknown } }) : null;
              reply({ ok: !!j?.save, data: j?.save?.data ?? null });
            } else if (d.op === "list") {
              const r = await authFetch(`/api/saves?game=${game}`);
              const j = r.ok ? ((await r.json()) as { saves?: unknown[] }) : null;
              reply({ ok: !!j, data: j?.saves ?? [] });
            } else reply({ ok: false });
          } catch {
            reply({ ok: false });
          }
        })();
        return;
      }
      if (d.type === "preview-error") {
        setError({ kind: d.kind ?? "error", message: d.message ?? "خطأ غير معروف" });
      } else if (d.type === "preview-retry") {
        setError(null);
        setRetryTick((n) => n + 1);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [authFetch]);
  return { error, retryTick, clear: () => setError(null) };
}

/** One-click AI repair: streams the fully-fixed HTML back from the server. */
function useAutoFix(html: string, onFixed: (fixed: string) => void) {
  const { authFetch } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const run = async (message: string) => {
    if (busy) return;
    setBusy(true);
    setNote("جاري الإصلاح…");
    try {
      const res = await authFetch("/api/ai/autofix", {
        method: "POST",
        body: JSON.stringify({ html: html.slice(0, 320_000), error: message }),
      });
      if (!res.ok || !res.body) {
        setNote(res.status === 503 ? "الإصلاح غير متاح الآن" : "تعذّر الإصلاح");
        setTimeout(() => setNote(""), 2200);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let out = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out += dec.decode(value, { stream: true });
      }
      const fence = /```html?\n([\s\S]*?)```/i.exec(out);
      const fixed = (fence ? fence[1] : out).trim();
      if (fixed.length > 200 && /^<!doctype html|^<html[\s>]/i.test(fixed)) {
        onFixed(fixed);
        setNote("تم الإصلاح ✓");
      } else {
        setNote("تعذّر الإصلاح");
      }
      setTimeout(() => setNote(""), 2200);
    } catch {
      setNote("تعذّر الإصلاح");
      setTimeout(() => setNote(""), 2200);
    } finally {
      setBusy(false);
    }
  };
  return { busy, note, run };
}

/** The amber banner shown under the preview toolbar when the guard fires. */
function ErrorBanner({
  error,
  busy,
  note,
  onFix,
  onDismiss,
}: {
  error: PreviewError;
  busy: boolean;
  note: string;
  onFix: () => void;
  onDismiss: () => void;
}) {
  if (!error && !note) return null;
  return (
    <div dir="rtl" className="flex flex-wrap items-center gap-2 border-b border-amber-400/25 bg-amber-500/10 px-3 py-1.5">
      {error ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-amber-200" dir="ltr" title={error.message}>
            {error.message}
          </span>
          <button
            type="button"
            onClick={onFix}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-gradient-to-r from-amber-400 to-rose-500 px-2.5 py-1 text-[11px] font-black text-[#10131f] transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {busy ? "يصلح…" : "إصلاح تلقائي"}
          </button>
          <button type="button" onClick={onDismiss} aria-label="تجاهل" className="shrink-0 text-amber-300/70 transition hover:text-amber-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-[11px] font-black text-emerald-300">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          {note}
        </span>
      )}
    </div>
  );
}

/**
 * The sandboxed iframe, with a loading veil so there is never a white/black
 * flash or a half-drawn frame, and NO width transition (that transition was
 * what made the preview jitter while switching phone / tablet / desktop).
 * The dark base matches the guard's crash card so even a dead frame looks
 * intentional, never a glitchy black rectangle.
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
  // the iframe remounts via key whenever doc/runKey changes, so these start false
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), 900);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="relative flex min-h-0 min-w-0 max-w-full justify-center bg-[radial-gradient(120%_120%_at_50%_0%,#101a3f,#070b1e_60%,#04060f)]" style={{ width: style?.width ?? "100%", height: style?.height === "100%" ? "100%" : undefined }}>
      {(!ready || !settled) && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-[inherit] bg-[radial-gradient(120%_120%_at_50%_0%,#101a3f,#070b1e_60%,#04060f)] transition-opacity duration-300" style={{ opacity: ready && settled ? 0 : 1 }}>
          <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
        </div>
      )}
      <iframe
        key={`${runKey}:${doc.length}`}
        title={title}
        srcDoc={doc}
        sandbox="allow-scripts allow-pointer-lock allow-modals allow-forms"
        allow="fullscreen"
        loading="eager"
        onLoad={() => setReady(true)}
        className={cn("block max-w-full", className)}
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
  const [fixedHtml, setFixedHtml] = useState<string | null>(null);
  const liveHtml = fixedHtml ?? html;
  const boxRef = useRef<HTMLDivElement>(null);
  const { error, retryTick, clear } = usePreviewErrors();
  const fix = useAutoFix(liveHtml, (f) => {
    setFixedHtml(f);
    clear();
    setRun((n) => n + 1);
  });
  const doc = useMemo(() => withCsp(liveHtml), [liveHtml]);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const [flash, setFlash] = useState("");
  const widths = { phone: 390, tablet: 768, desktop: 0 } as const;
  const { authFetch } = useAuth();

  // a re-run coming from the in-frame retry button
  useEffect(() => {
    if (retryTick > 0) setRun((n) => n + 1);
  }, [retryTick]);
  // new source code => drop the previous repair
  useEffect(() => {
    setFixedHtml(null);
    clear();
  }, [html]); // eslint-disable-line react-hooks/exhaustive-deps

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 1800);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(liveHtml);
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
      const title = (liveHtml.match(/<title>([^<]{1,60})<\/title>/i)?.[1] ?? "عمل بدون عنوان").trim();
      const res = await authFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ title, html: liveHtml }),
      });
      if (res.ok) say("حُفظ في الاستوديو");
      else if (res.status === 409) say("الاستوديو ممتلئ (40 عمل)");
      else say("تعذّر الحفظ");
    } catch {
      say("تعذّر الحفظ");
    }
  };
  const zip = () => downloadBlob(createZip(splitHtml(liveHtml)), "nexus-project.zip");

  const download = () => {
    const url = URL.createObjectURL(new Blob([liveHtml], { type: "text/html;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "nexus-game.html";
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
        {fixedHtml && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-black text-emerald-300">
            <Wand2 className="h-3 w-3" />
            نسخة مُصلحة
          </span>
        )}
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
          <button type="button" className={btn} onClick={() => { clear(); setFixedHtml(null); setRun((n) => n + 1); }}>
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
      <ErrorBanner
        error={error}
        busy={fix.busy}
        note={fix.note}
        onFix={() => error && void fix.run(error.message)}
        onDismiss={clear}
      />
      {flash && (
        <p className="flex items-center justify-center gap-1.5 bg-brand-500/15 py-1 text-[11px] font-black text-brand-300">
          <Check className="h-3.5 w-3.5" />
          {flash}
        </p>
      )}
      {view === "code" ? (
        <pre dir="ltr" className="overflow-auto bg-[#0f172a] p-4 text-left text-[11.5px] leading-relaxed text-[#dbe3f5]" style={{ height, minHeight: 280 }}>
          <code>{liveHtml}</code>
        </pre>
      ) : (
        <div className="flex flex-1 justify-center p-0 sm:p-3">
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
  const [fixedHtml, setFixedHtml] = useState<string | null>(null);
  const liveHtml = fixedHtml ?? html;
  const { error, retryTick, clear } = usePreviewErrors();
  const [run, setRun] = useState(0);
  const fix = useAutoFix(liveHtml, (f) => {
    setFixedHtml(f);
    clear();
    setRun((n) => n + 1);
  });
  const doc = useMemo(() => withCsp(liveHtml), [liveHtml]);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const [flash, setFlash] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);
  const title = useMemo(() => (liveHtml.match(/<title>([^<]{1,60})<\/title>/i)?.[1] ?? "معاينة Nexus AI").trim(), [liveHtml]);
  const widths = { phone: 390, tablet: 768, desktop: 0 } as const;
  const isClient = useIsClient();

  useEffect(() => {
    if (retryTick > 0) setRun((n) => n + 1);
  }, [retryTick]);

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
          <p className="truncate text-[10.5px] font-bold text-brand-300">
            معاينة حيّة · شاشة كاملة{fixedHtml ? " · نسخة مُصلحة" : ""}
          </p>
        </div>
        <div className="flex min-w-0 shrink flex-wrap items-center justify-end gap-1.5">
          <button type="button" aria-label="إعادة تشغيل" onClick={() => { clear(); setFixedHtml(null); setRun((n) => n + 1); }} className={ib}>
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
          <button type="button" aria-label="تحميل ZIP" onClick={() => downloadBlob(createZip(splitHtml(liveHtml)), "nexus-project.zip")} className={cn(ib, "border-amber-300/40 text-amber-200")}>
            <Package className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            aria-label="حفظ في الاستوديو"
            onClick={async () => {
              try {
                const res = await authFetch("/api/projects", { method: "POST", body: JSON.stringify({ title, html: liveHtml }) });
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
                await navigator.clipboard.writeText(liveHtml);
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

      <ErrorBanner
        error={error}
        busy={fix.busy}
        note={fix.note}
        onFix={() => error && void fix.run(error.message)}
        onDismiss={clear}
      />
      {flash && (
        <p className="flex items-center justify-center gap-1.5 bg-brand-500/20 py-1 text-[11px] font-black text-brand-300">
          <Check className="h-3.5 w-3.5" />
          {flash}
        </p>
      )}

      {view === "code" ? (
        <pre dir="ltr" className="min-h-0 flex-1 overflow-auto bg-[#0f172a] p-4 text-left text-[12px] leading-relaxed text-[#dbe3f5]">
          <code>{liveHtml}</code>
        </pre>
      ) : (
        <div className="flex min-h-0 flex-1 justify-center sm:p-3">
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
