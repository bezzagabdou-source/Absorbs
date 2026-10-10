"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  RotateCcw,
  Terminal,
  X,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ArtifactsContext,
  artifactKind,
  type Artifact,
  type ArtifactKind,
} from "@/components/chat/artifacts-context";
import { NEXUS_NET_SHIM } from "@/lib/mobile-game";

/* ------------------------------------------------------------------ */
/* Sandboxed document builders                                         */
/* ------------------------------------------------------------------ */

/** https-only assets (images, sounds, Google Fonts), scripts only from the CDNs below, never same-origin with the app. */
const CSP =
  "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://cdn.tailwindcss.com; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: blob: https:; media-src data: blob: https:; font-src data: https://fonts.gstatic.com; connect-src https:";

/** Forwards console output and errors to the parent window. */
const BRIDGE = `(function(){var P=function(t,a){try{parent.postMessage({__barq:1,t:t,a:a},"*")}catch(e){}};
["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){var a=[].slice.call(arguments).map(function(x){if(typeof x==="string")return x;try{var s=JSON.stringify(x);return s===undefined?String(x):s}catch(e){return String(x)}});P(k,a.join(" "));if(o)o.apply(console,arguments)}});
window.addEventListener("error",function(e){P("error",e.message)});
window.addEventListener("unhandledrejection",function(e){P("error",String(e.reason))});})();`;

const HEAD = `<meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><script>${BRIDGE}</script>${NEXUS_NET_SHIM}`;

const safeScript = (s: string) => s.replace(/<\/script/gi, "<\\/script");

function htmlDoc(code: string): string {
  if (/<head[^>]*>/i.test(code)) return code.replace(/<head([^>]*)>/i, `<head$1>${HEAD}`);
  if (/<html[^>]*>/i.test(code)) return code.replace(/<html([^>]*)>/i, `<html$1><head>${HEAD}</head>`);
  return `<!doctype html><html><head><meta charset="utf-8">${HEAD}</head><body>${code}</body></html>`;
}

function jsDoc(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${HEAD}<style>body{margin:0;padding:12px;font:13px ui-monospace,Menlo,monospace;color:#e2e8f0;background:#05041a}</style></head><body><script>try{${safeScript(
    code
  )}\n}catch(e){console.error(e&&e.message?e.message:String(e))}</script></body></html>`;
}

function svgDoc(code: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">${HEAD}<style>html,body{height:100%;margin:0;display:grid;place-items:center;background:#fff}svg{max-width:100%;max-height:100%}</style></head><body>${code}</body></html>`;
}

/** Turns a single-file React component into something that runs in the browser. */
function reactDoc(code: string): string {
  let name = "App";
  const fn = /export\s+default\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(code);
  const id = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/m.exec(code);
  let src = code
    .replace(/^\s*import[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm, "")
    .replace(/^\s*import\s+["'][^"']+["'];?\s*$/gm, "");
  if (fn) {
    name = fn[1];
    src = src.replace(/export\s+default\s+(async\s+)?function/, "$1function");
  } else if (id) {
    name = id[1];
    src = src.replace(/export\s+default\s+[A-Za-z_$][\w$]*\s*;?/, "");
  } else if (/export\s+default/.test(src)) {
    src = src.replace(/export\s+default/, "const __App =");
    name = "__App";
  }
  src = src.replace(/^\s*export\s+(?=(const|function|class|let|var)\b)/gm, "");
  const run = `const {useState,useEffect,useRef,useMemo,useCallback,useReducer,useContext,createContext,Fragment,useLayoutEffect,useId}=React;
${src}
ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(${name}));`;
  return `<!doctype html><html><head><meta charset="utf-8">${HEAD}
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/react@18.3.1/umd/react.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7.26.2/babel.min.js"></script>
<style>body{margin:0;font-family:system-ui,sans-serif}</style></head>
<body><div id="root"></div>
<script type="text/babel" data-presets="react,typescript" data-type="module">${safeScript(run)}</script></body></html>`;
}

function buildDoc(kind: ArtifactKind, code: string): string | null {
  switch (kind) {
    case "html":
      return htmlDoc(code);
    case "js":
      return jsDoc(code);
    case "svg":
      return svgDoc(code);
    case "react":
      return reactDoc(code);
    default:
      return null;
  }
}

const KIND_LABEL: Record<ArtifactKind, string> = {
  html: "HTML",
  react: "React",
  js: "JavaScript",
  svg: "SVG",
  markdown: "Markdown",
  code: "Code",
};
const KIND_EXT: Record<ArtifactKind, string> = {
  html: "html",
  react: "jsx",
  js: "js",
  svg: "svg",
  markdown: "md",
  code: "txt",
};

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

type LogLine = { t: "log" | "info" | "warn" | "error"; text: string };

function IconBtn({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 place-items-center rounded-lg transition active:scale-90",
        "text-slate-600 hover:bg-slate-900/8 hover:text-slate-900",
        "dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white",
        active && "bg-slate-900/8 dark:bg-white/10"
      )}
    >
      {children}
    </button>
  );
}

export function ArtifactsPanel({
  artifact,
  onClose,
}: {
  artifact: Artifact | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [wide, setWide] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const kind = artifact ? artifactKind(artifact.lang, artifact.code) : "code";
  const doc = useMemo(() => (artifact ? buildDoc(kind, artifact.code) : null), [artifact, kind]);
  const canPreview = kind === "markdown" || doc !== null;

  // reset when a different artifact is opened
  useEffect(() => {
    if (!artifact) return;
    setTab(kind === "code" ? "code" : "preview");
    setLogs([]);
    setShowLogs(false);
    setLoaded(false);
    setRunKey((k) => k + 1);
  }, [artifact, kind]);

  // console + error messages coming from the sandboxed iframe
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __barq?: number; t?: LogLine["t"]; a?: string } | null;
      if (!d || d.__barq !== 1 || e.source !== frameRef.current?.contentWindow) return;
      setLogs((l) => [...l.slice(-199), { t: d.t ?? "log", text: String(d.a ?? "") }]);
      if (d.t === "error") setShowLogs(true);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    if (!artifact) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [artifact, onClose]);

  const rerun = useCallback(() => {
    setLogs([]);
    setLoaded(false);
    setRunKey((k) => k + 1);
  }, []);

  const copy = async () => {
    if (!artifact) return;
    try {
      await navigator.clipboard.writeText(artifact.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  const download = () => {
    if (!artifact) return;
    const url = URL.createObjectURL(new Blob([artifact.code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(artifact.title || "barq-artifact").replace(/[^\w.-]+/g, "-")}.${KIND_EXT[kind]}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const rtl = typeof document !== "undefined" && document.documentElement.dir === "rtl";
  const errors = logs.filter((l) => l.t === "error").length;

  return (
    <AnimatePresence>
      {artifact && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[88] bg-slate-900/40 backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-none"
          />
          <motion.aside
            key="panel"
            role="dialog"
            aria-label="Artifact"
            initial={{ opacity: 0, x: rtl ? -48 : 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: rtl ? -48 : 48 }}
            transition={{ type: "spring", damping: 32, stiffness: 340 }}
            className={cn(
              "fixed inset-y-0 end-0 z-[90] flex w-full flex-col overflow-hidden border-s backdrop-blur-xl",
              "border-slate-900/10 bg-white/90 text-slate-900",
              "dark:border-white/10 dark:bg-ink-900/90 dark:text-slate-100",
              "shadow-[-24px_0_60px_-30px_rgba(0,0,0,0.6)]",
              wide ? "lg:w-[min(100vw,980px)]" : "lg:w-[min(100vw,560px)]"
            )}
            style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* header */}
            <header className="flex items-center gap-2 border-b border-slate-900/10 px-3 py-2 dark:border-white/10">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black">{artifact.title || KIND_LABEL[kind]}</p>
                <p dir="ltr" className="text-start text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {KIND_LABEL[kind]} · {artifact.code.split("\n").length} lines
                </p>
              </div>

              {canPreview && (
                <div
                  role="tablist"
                  className="relative flex rounded-lg bg-slate-900/6 p-0.5 text-xs font-bold dark:bg-white/8"
                >
                  {(["preview", "code"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={tab === t}
                      onClick={() => setTab(t)}
                      className={cn(
                        "relative z-10 flex items-center gap-1 rounded-md px-2.5 py-1.5 transition-colors",
                        tab === t ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"
                      )}
                    >
                      {tab === t && (
                        <motion.span
                          layoutId="artifact-tab"
                          className="absolute inset-0 -z-10 rounded-md bg-white shadow-sm dark:bg-white/15"
                          transition={{ type: "spring", damping: 30, stiffness: 400 }}
                        />
                      )}
                      {t === "preview" ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
                      {t === "preview" ? "معاينة" : "الكود"}
                    </button>
                  ))}
                </div>
              )}

              {doc && (
                <IconBtn label="تشغيل من جديد" onClick={rerun}>
                  <RotateCcw className="size-4" />
                </IconBtn>
              )}
              <IconBtn label="نسخ" onClick={() => void copy()}>
                {copied ? <Check className="size-4 text-emerald-500" /> : <Copy className="size-4" />}
              </IconBtn>
              <IconBtn label="تحميل" onClick={download}>
                <Download className="size-4" />
              </IconBtn>
              <span className="hidden lg:block">
                <IconBtn label={wide ? "تصغير" : "توسيع"} onClick={() => setWide((w) => !w)}>
                  {wide ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
                </IconBtn>
              </span>
              <IconBtn label="إغلاق" onClick={onClose}>
                <X className="size-4.5" />
              </IconBtn>
            </header>

            {/* body */}
            <div className="relative min-h-0 flex-1">
              {tab === "preview" && kind === "markdown" && (
                <div className="scroll-y h-full p-4">
                  <Markdown>{artifact.code}</Markdown>
                </div>
              )}

              {tab === "preview" && doc && (
                <>
                  {!loaded && (
                    <div className="absolute inset-0 z-10 space-y-3 bg-white p-5 dark:bg-ink-900">
                      <Skeleton className="h-6 w-1/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="h-40 w-full rounded-2xl" />
                    </div>
                  )}
                  <iframe
                    key={runKey}
                    ref={frameRef}
                    title={artifact.title || "artifact"}
                    sandbox="allow-scripts allow-modals allow-pointer-lock"
                    srcDoc={doc}
                    onLoad={() => setLoaded(true)}
                    className="h-full w-full border-0 bg-white"
                  />
                </>
              )}

              {(tab === "code" || !canPreview) && (
                <pre
                  dir="ltr"
                  className="scroll-y h-full whitespace-pre bg-[#05041a] p-4 text-start text-[12.5px] leading-relaxed text-slate-200"
                >
                  <code>{artifact.code}</code>
                </pre>
              )}
            </div>

            {/* console */}
            {doc && tab === "preview" && (
              <div className="border-t border-slate-900/10 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setShowLogs((v) => !v)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300"
                >
                  <Terminal className="size-3.5" />
                  Console
                  {logs.length > 0 && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px]",
                        errors
                          ? "bg-rose-500/20 text-rose-600 dark:text-rose-300"
                          : "bg-slate-900/10 dark:bg-white/10"
                      )}
                    >
                      {logs.length}
                    </span>
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {showLogs && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 148 }}
                      exit={{ height: 0 }}
                      className="scroll-y overflow-hidden bg-[#05041a]"
                    >
                      <div dir="ltr" className="space-y-0.5 p-2 font-mono text-[11.5px]">
                        {logs.length === 0 && <p className="text-slate-500">No output yet.</p>}
                        {logs.map((l, i) => (
                          <p
                            key={i}
                            className={cn(
                              "whitespace-pre-wrap break-words",
                              l.t === "error" && "text-rose-300",
                              l.t === "warn" && "text-amber-300",
                              (l.t === "log" || l.t === "info") && "text-slate-200"
                            )}
                          >
                            {l.text}
                          </p>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** Wrap the chat page once; any code block below can then open the panel. */
export function ArtifactsProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Artifact | null>(null);
  const api = useMemo(
    () => ({
      current,
      open: (a: Artifact) => setCurrent(a),
      close: () => setCurrent(null),
    }),
    [current]
  );
  return (
    <ArtifactsContext.Provider value={api}>
      {children}
      <ArtifactsPanel artifact={current} onClose={api.close} />
    </ArtifactsContext.Provider>
  );
}
