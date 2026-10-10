"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Copy,
  Eye,
  FileText,
  Loader2,
  Monitor,
  Package,
  PenLine,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Tablet,
  Terminal,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { createZip, downloadBlob, filesFromReply, splitHtml, zipSizeLabel, type ZipFile } from "@/lib/zip";
import {
  buildSandboxDocument,
  parseSandboxMessage,
  type SandboxConsoleEntry,
} from "@/lib/sandbox-engine";
import { extractHtml } from "@/lib/attachments";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { DeployPanel } from "@/components/studio/deploy-panel";

/* ------------------------------------------------------------------ */
/* Sandbox document: CSP + runtime-error bridge (+ visual editor)      */
/* ------------------------------------------------------------------ */

/** Scripts only from two pinned CDN hosts (Three.js etc.); no network calls from generated code. */
const CSP =
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; style-src \'unsafe-inline\'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src \'none\'">';

const BRIDGE = `<script data-barq>(function(){
function s(m){try{parent.postMessage({__barq:1,type:'error',msg:String(m).slice(0,400)},'*')}catch(e){}}
window.addEventListener('error',function(e){s((e.message||'Error')+(e.lineno?' (line '+e.lineno+')':''))});
window.addEventListener('unhandledrejection',function(e){s('Promise: '+((e.reason&&e.reason.message)||e.reason))});
var ce=console.error;console.error=function(){s([].slice.call(arguments).join(' '));ce.apply(console,arguments)};
})();</script>`;

const VISUAL = `<script data-barq>(function(){
var sel=null;
var st=document.createElement('style');st.setAttribute('data-barq','1');
st.textContent='[data-barq-sel]{outline:2px solid #fff!important;outline-offset:2px!important}';
document.head.appendChild(st);
function clean(){var c=document.documentElement.cloneNode(true);
c.querySelectorAll('[data-barq]').forEach(function(n){n.remove()});
c.querySelectorAll('[data-barq-sel]').forEach(function(n){n.removeAttribute('data-barq-sel')});
c.querySelectorAll('[contenteditable]').forEach(function(n){n.removeAttribute('contenteditable')});
return '<!DOCTYPE html>\\n'+c.outerHTML}
function post(){parent.postMessage({__barq:1,type:'html',html:clean()},'*')}
function unsel(){if(sel){sel.removeAttribute('data-barq-sel');sel.removeAttribute('contenteditable')}}
document.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();
unsel();sel=e.target;sel.setAttribute('data-barq-sel','1');
var cs=getComputedStyle(sel);
parent.postMessage({__barq:1,type:'select',tag:sel.tagName.toLowerCase(),
text:sel.children.length?'':(sel.textContent||'').slice(0,300),
size:parseInt(cs.fontSize)||16,comp:(sel.closest('[data-component]')||{getAttribute:function(){return ''}}).getAttribute('data-component')||'',
outer:(function(){var o=sel.cloneNode(true);o.removeAttribute('data-barq-sel');o.removeAttribute('contenteditable');var h=o.outerHTML;return h.length>12000?'':h})()},'*')},true);
document.addEventListener('dblclick',function(e){var t=e.target;
if(!t.children.length){t.setAttribute('contenteditable','true');t.focus()}},true);
document.addEventListener('blur',function(e){var t=e.target;
if(t&&t.getAttribute&&t.getAttribute('contenteditable')){t.removeAttribute('contenteditable');post()}},true);
window.addEventListener('message',function(e){var d=e.data;if(!d||!d.__barq||!sel)return;
if(d.type==='style'){sel.style[d.prop]=d.value;post()}
else if(d.type==='text'){if(!sel.children.length){sel.textContent=d.value;post()}}
else if(d.type==='delete'){sel.remove();sel=null;post()}
else if(d.type==='replace'&&typeof d.html==='string'){var t=document.createElement('template');t.innerHTML=d.html;var n=t.content.firstElementChild;if(!n)return;
if(d.css){var ps=document.getElementById('barq-patch');if(!ps){ps=document.createElement('style');ps.id='barq-patch';document.head.appendChild(ps)}ps.textContent+=' '+d.css}
sel.replaceWith(n);sel=n;sel.setAttribute('data-barq-sel','1');post()}});
})();</script>`;

function buildDoc(html: string, visual: boolean): string {
  const inject = CSP + BRIDGE;
  const tail = visual ? VISUAL : "";
  let out = html;
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, `<head$1>${inject}`);
  else if (/<html[^>]*>/i.test(out)) out = out.replace(/<html([^>]*)>/i, `<html$1><head>${inject}</head>`);
  else out = `<!DOCTYPE html><html><head><meta charset="utf-8">${inject}</head><body>${out}</body></html>`;
  if (!tail) return out;
  return /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${tail}</body>`) : out + tail;
}

/** While the answer is still streaming, only show a page whose scripts are complete. */
function safePartial(html: string): string | null {
  if (!/<(body|canvas|div|main|section)/i.test(html)) return null;
  const open = (html.match(/<script\b/gi) ?? []).length;
  const close = (html.match(/<\/script>/gi) ?? []).length;
  if (open <= close) return html;
  const cut = html.lastIndexOf("<script");
  return cut > 0 ? html.slice(0, cut) + "</body></html>" : null;
}

/* ------------------------------------------------------------------ */
/* File tree                                                           */
/* ------------------------------------------------------------------ */

type TreeNode = { name: string; path: string; children: TreeNode[]; file: boolean };

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], file: false };
  for (const p of paths) {
    const parts = p.split("/").filter(Boolean);
    let cur = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join("/");
      const isFile = i === parts.length - 1;
      let next = cur.children.find((c) => c.path === path);
      if (!next) {
        next = { name: part, path, children: [], file: isFile };
        cur.children.push(next);
      }
      cur = next;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file ? 1 : -1));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

function Tree({
  nodes,
  depth,
  active,
  closed,
  onToggle,
  onOpen,
}: {
  nodes: TreeNode[];
  depth: number;
  active: string;
  closed: Set<string>;
  onToggle: (p: string) => void;
  onOpen: (p: string) => void;
}) {
  return (
    <>
      {nodes.map((n) => {
        const isClosed = closed.has(n.path);
        return (
          <div key={n.path}>
            <button
              type="button"
              data-active={n.file && active === n.path}
              onClick={() => (n.file ? onOpen(n.path) : onToggle(n.path))}
              className="tree-row flex w-full items-center gap-1.5 py-1 pe-2 text-start text-[12.5px] text-slate-300"
              style={{ paddingInlineStart: 8 + depth * 14 }}
            >
              {n.file ? (
                <FileText className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              ) : isClosed ? (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              )}
              <span className="truncate">{n.name}</span>
            </button>
            {!n.file && !isClosed && (
              <Tree nodes={n.children} depth={depth + 1} active={active} closed={closed} onToggle={onToggle} onOpen={onOpen} />
            )}
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Workbench                                                           */
/* ------------------------------------------------------------------ */

type Mode = "code" | "live" | "visual";
type Device = "phone" | "tablet" | "desktop";
type Sel = { tag: string; text: string; size: number; comp: string; outer: string } | null;

export function Workbench({
  reply,
  streaming,
  healing,
  onFix,
  className,
}: {
  reply: string;
  streaming: boolean;
  healing: boolean;
  onFix: (log: string) => void;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("live");
  const [device, setDevice] = useState<Device>("desktop");
  const [activePath, setActivePath] = useState("index.html");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState("");
  const [reload, setReload] = useState(0);

  const [liveHtml, setLiveHtml] = useState("");
  const [edited, setEdited] = useState<string | null>(null);
  const [frameHtml, setFrameHtml] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [autoHeal, setAutoHeal] = useState(true);
  const [sel, setSel] = useState<Sel>(null);
  const { authFetch } = useAuth();
  const [deployOpen, setDeployOpen] = useState(false);
  const [aiAsk, setAiAsk] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const healedFor = useRef("");
  const healCount = useRef(0);
  const frameRef = useRef<HTMLIFrameElement>(null);

  /* ----- v19: in-browser execution sandbox (multi-file JS/TS live runner) ----- */
  const [sandbox, setSandbox] = useState(false);
  const [sandboxDoc, setSandboxDoc] = useState("");
  const [sandboxEngine, setSandboxEngine] = useState<"esbuild" | "shim" | "static">("static");
  const [consoleLog, setConsoleLog] = useState<SandboxConsoleEntry[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);

  /* ----- hot reload: follow the stream, throttled, only complete scripts ----- */
  const latest = useRef(reply);
  useEffect(() => {
    latest.current = reply;
  }, [reply]);
  useEffect(() => {
    if (!streaming) return;
    const t = setInterval(() => {
      const page = extractHtml(latest.current);
      const ok = page ? safePartial(page) : null;
      if (ok) {
        setLiveHtml((prev) => (prev === ok ? prev : ok));
      }
    }, 1100);
    return () => clearInterval(t);
  }, [streaming]);

  /* final version once the stream is done */
  useEffect(() => {
    if (streaming) return;
    const page = extractHtml(reply);
    if (page) {
      setLiveHtml(page);
      setEdited(null);
      setErrors([]);
    }
  }, [streaming, reply]);

  /* a new generation starts → forget the previous heal bookkeeping */
  useEffect(() => {
    if (!streaming) return;
    setEdited(null);
    healedFor.current = "";
    if (!healing) healCount.current = 0; // a fresh user prompt earns a fresh heal budget
  }, [streaming, healing]);

  const current = edited ?? liveHtml;

  /* the iframe only reloads on explicit events (new stream chunk, mode switch, reload) */
  useEffect(() => {
    setFrameHtml(liveHtml);
  }, [liveHtml]);
  useEffect(() => {
    setFrameHtml(edited ?? liveHtml);
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, reload]);

  const doc = useMemo(() => (frameHtml ? buildDoc(frameHtml, mode === "visual") : ""), [frameHtml, mode]);

  /* ----- messages coming out of the sandbox ----- */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      /* v19 sandbox console bridge */
      const entry = parseSandboxMessage(e.data);
      if (entry) {
        setConsoleLog((l) => (l.length >= 200 ? [...l.slice(-199), entry] : [...l, entry]));
        if (entry.kind === "error" && !streaming)
          setErrors((l) => (l.includes(entry.text) || l.length >= 6 ? l : [...l, entry.text]));
        return;
      }
      const d = e.data as { __barq?: number; type?: string; msg?: string; html?: string; tag?: string; text?: string; size?: number; comp?: string; outer?: string };
      if (!d || d.__barq !== 1) return;
      if (d.type === "error" && !streaming && d.msg) {
        setErrors((l) => (l.includes(d.msg!) || l.length >= 6 ? l : [...l, d.msg!]));
      } else if (d.type === "html" && typeof d.html === "string") {
        setEdited(d.html);
      } else if (d.type === "select") {
        setSel({ tag: d.tag ?? "", text: d.text ?? "", size: d.size ?? 16, comp: d.comp ?? "", outer: d.outer ?? "" });
        setAiErr("");
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [streaming]);

  /* ----- self-healing loop: diagnose the logs, ask the engine to fix, max 2 rounds ----- */
  const log = errors.join("\n");
  useEffect(() => {
    if (!autoHeal || streaming || healing || !log || healCount.current >= 2) return;
    if (healedFor.current === log) return;
    const t = setTimeout(() => {
      healedFor.current = log;
      healCount.current += 1;
      onFix(log);
    }, 1400);
    return () => clearTimeout(t);
  }, [autoHeal, streaming, healing, log, onFix]);

  /* ----- files ----- */
  const files = useMemo<ZipFile[]>(() => {
    const base = filesFromReply(reply);
    if (!edited) return base;
    const map = new Map(base.map((f) => [f.path, f] as const));
    ["index.html", "css/style.css", "js/app.js"].forEach((p) => map.delete(p));
    const merged = [...splitHtml(edited), ...map.values()];
    return merged;
  }, [reply, edited]);

  const tree = useMemo(() => buildTree(files.map((f) => f.path)), [files]);
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];
  const activeText = activeFile ? (typeof activeFile.data === "string" ? activeFile.data : "") : "";

  /* ----- sandbox build: recompiles the live document whenever the project changes ----- */
  useEffect(() => {
    if (!sandbox) return;
    let alive = true;
    const projectFiles = files
      .filter((f) => typeof f.data === "string")
      .map((f) => ({ path: f.path, code: f.data as string }));
    if (projectFiles.length === 0) return;
    const t = setTimeout(() => {
      void buildSandboxDocument(projectFiles, { allowCdn: true }).then((built) => {
        if (!alive) return;
        setSandboxDoc(built.doc);
        setSandboxEngine(built.engine);
      });
    }, 450);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [sandbox, files, reload]);

  const displayDoc = sandbox && mode === "live" && sandboxDoc ? sandboxDoc : doc;

  const say = (m: string) => {
    setFlash(m);
    setTimeout(() => setFlash(""), 1600);
  };
  const toggle = useCallback((p: string) => {
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  }, []);

  const exportZip = () => {
    if (files.length === 0) return;
    downloadBlob(createZip(files), "barq-project.zip");
    say(`ZIP · ${zipSizeLabel(files)}`);
  };
  const deploy = () => {
    exportZip();
    window.open("https://app.netlify.com/drop", "_blank", "noopener");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(activeText || current);
      say("تم النسخ");
    } catch {
      say("تعذّر النسخ");
    }
  };

  const send = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage({ __barq: 1, ...msg }, "*");

  /* ----- precision patch: only the clicked element is rewritten by the engine ----- */
  const patchSelected = async () => {
    const q = aiAsk.trim();
    if (!sel || !sel.outer || q.length < 2 || aiBusy) return;
    setAiBusy(true);
    setAiErr("");
    try {
      const html = edited ?? liveHtml;
      const rules = (/<!--\s*BARQ-RULES[\s\S]*?-->/.exec(html)?.[0] ?? "") + "\n" + (/:root\s*\{[\s\S]*?\}/.exec(html)?.[0] ?? "").slice(0, 1500);
      const res = await authFetch("/api/ai/patch", {
        method: "POST",
        body: JSON.stringify({ instruction: q, element: sel.outer, component: sel.comp, rules }),
      });
      if (!res.ok) {
        const code = ((await res.json().catch(() => ({}))) as { code?: string }).code;
        setAiErr(code === "PRO_ONLY" ? "هذه الميزة لخطة Pro." : code === "RATE" ? "تمهّل قليلاً ثم أعد المحاولة." : "تعذّر التعديل، أعد المحاولة.");
        return;
      }
      const out = (await res.json()) as { html?: string; css?: string };
      if (!out.html) {
        setAiErr("لم يصل تعديل صالح.");
        return;
      }
      send({ type: "replace", html: out.html, css: out.css ?? "" });
      setAiAsk("");
      say("تم تعديل العنصر");
    } catch {
      setAiErr("انقطع الاتصال، أعد المحاولة.");
    } finally {
      setAiBusy(false);
    }
  };

  const widths = { phone: 390, tablet: 768, desktop: 0 } as const;
  const empty = !current && !reply;

  const tab = (m: Mode, label: string, Icon: typeof Code2) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
        mode === m ? "bg-gradient-to-r from-brand-500 to-aqua-400 text-[#fff]" : "text-slate-400 hover:text-[#fff]"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
  const act =
    "inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand-400/20 bg-transparent px-2.5 text-xs font-semibold text-slate-300 transition hover:border-brand-300/60 hover:text-white disabled:opacity-40";

  return (
    <div dir="ltr" className={cn("glass relative flex min-h-0 flex-col overflow-hidden rounded-2xl", className)}>
      {/* toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-400/20 px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-brand-400/20 bg-black/40 p-0.5">
          {tab("code", "الكود", Code2)}
          {tab("live", "المعاينة الحية", Eye)}
          {tab("visual", "تعديل بصري", PenLine)}
        </div>

        {mode !== "code" && (
          <div className="flex items-center gap-0.5" role="group" aria-label="الجهاز">
            {([["phone", Smartphone], ["tablet", Tablet], ["desktop", Monitor]] as const).map(([d, Ic]) => (
              <button
                key={d}
                type="button"
                aria-label={d}
                aria-pressed={device === d}
                onClick={() => setDevice(d)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md transition",
                  device === d ? "bg-white/15 text-white" : "text-slate-500 hover:text-white"
                )}
              >
                <Ic className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {streaming && (
            <span className="inline-flex items-center gap-1.5 px-1 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              يُبنى الآن
            </span>
          )}
          <button type="button" className={act} onClick={() => setReload((n) => n + 1)} disabled={!current}>
            <RotateCcw className="h-3.5 w-3.5" />
            تشغيل
          </button>
          <button
            type="button"
            className={cn(act, sandbox && "border-aqua-300/70 bg-aqua-400/10 text-white")}
            onClick={() => {
              setSandbox((s) => !s);
              setConsoleLog([]);
              if (!sandbox) setConsoleOpen(true);
              setReload((n) => n + 1);
            }}
            disabled={files.length === 0}
            title="محرك التنفيذ داخل المتصفح: يشغّل مشاريع JS/TS متعددة الملفات مع وحدة تحكم حية"
          >
            <Terminal className="h-3.5 w-3.5" />
            Sandbox{sandbox ? ` · ${sandboxEngine}` : ""}
          </button>
          <button type="button" className={act} onClick={() => void copy()} disabled={!current}>
            <Copy className="h-3.5 w-3.5" />
            نسخ
          </button>
          <button type="button" className={act} onClick={exportZip} disabled={files.length === 0}>
            <Package className="h-3.5 w-3.5" />
            ZIP
          </button>
          <button type="button" className={act} onClick={() => setDeployOpen((o) => !o)} disabled={files.length === 0}>
            <Zap className="h-3.5 w-3.5" />
            نشر
          </button>
        </div>
      </div>

      {deployOpen && files.length > 0 && (
        <DeployPanel files={files} title={(/<title>([^<]{1,80})<\/title>/i.exec(current)?.[1] ?? "Nexus AI v8.4 project").trim()} onClose={() => setDeployOpen(false)} onNetlify={deploy} />
      )}

      {flash && (
        <p className="flex items-center justify-center gap-1.5 border-b border-brand-400/20 bg-white/5 py-1 text-[11px] font-semibold text-white">
          <Check className="h-3.5 w-3.5" />
          {flash}
        </p>
      )}

      {/* self-healing banner */}
      {(errors.length > 0 || healing) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-400/20 bg-white/[0.04] px-3 py-2 text-xs text-slate-200">
          {healing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4 text-slate-300" />}
          <span className="min-w-0 flex-1 truncate" dir="auto">
            {healing ? "المحرك يشخّص الأخطاء ويصلح الكود..." : errors[errors.length - 1]}
          </span>
          {!healing && (
            <>
              <label className="flex cursor-pointer items-center gap-1.5 text-slate-400">
                <input type="checkbox" checked={autoHeal} onChange={(e) => setAutoHeal(e.target.checked)} className="accent-white" />
                إصلاح ذاتي
              </label>
              <button type="button" className={act} onClick={() => onFix(log)}>
                <RefreshCw className="h-3.5 w-3.5" />
                أصلح الآن
              </button>
              <button type="button" className="text-slate-500 hover:text-white" aria-label="مسح" onClick={() => setErrors([])}>
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* file explorer */}
        <aside className="scroll-y hidden w-56 shrink-0 border-e border-brand-400/20 bg-black/30 py-2 md:block">
          <p className="px-3 pb-1.5 text-[11px] font-semibold text-slate-500">المشروع</p>
          {files.length === 0 ? (
            <p className="px-3 py-2 text-xs leading-relaxed text-slate-600">ستظهر الملفات هنا فور بدء التوليد.</p>
          ) : (
            <Tree
              nodes={tree}
              depth={0}
              active={activeFile?.path ?? ""}
              closed={closed}
              onToggle={toggle}
              onOpen={(p) => {
                setActivePath(p);
                setMode("code");
              }}
            />
          )}
        </aside>

        {/* stage */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* mobile file picker */}
          {files.length > 1 && (
            <select
              className="input-base m-2 !w-auto md:hidden"
              value={activeFile?.path}
              onChange={(e) => {
                setActivePath(e.target.value);
                setMode("code");
              }}
              aria-label="الملف"
            >
              {files.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          )}

          {mode === "code" ? (
            <div className="scroll-y min-h-0 flex-1 bg-black">
              {activeFile ? (
                <>
                  <p className="sticky top-0 z-10 border-b border-brand-400/20 bg-black/90 px-3 py-1.5 text-[11px] text-slate-500 backdrop-blur">
                    {activeFile.path}
                  </p>
                  <pre className="code-surface p-0 text-slate-300">
                    {activeText.split("\n").map((line, i) => (
                      <div key={i} className="flex">
                        <span className="w-12 shrink-0 select-none pe-3 text-end text-slate-700">{i + 1}</span>
                        <code className="whitespace-pre-wrap break-all pe-3">{line || " "}</code>
                      </div>
                    ))}
                  </pre>
                </>
              ) : (
                <Empty />
              )}
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 justify-center bg-[radial-gradient(circle_at_50%_0%,#18181b,#050505)] sm:p-3">
              {displayDoc ? (
                <iframe
                  ref={frameRef}
                  key={`${mode}-${reload}-${sandbox ? "sb" : "std"}`}
                  title="المعاينة"
                  srcDoc={displayDoc}
                  sandbox="allow-scripts allow-pointer-lock allow-modals allow-forms"
                  allow="fullscreen"
                  className={cn("block h-full bg-black transition-all duration-300", device !== "desktop" && "rounded-[1.6rem] ring-4 ring-white/10")}
                  style={{ minHeight: 320, width: widths[device] ? `min(100%, ${widths[device]}px)` : "100%" }}
                />
              ) : (
                <Empty />
              )}

              {/* v19: live sandbox console */}
              {consoleOpen && sandbox && mode === "live" && (
                <div className="glass-deep absolute inset-x-3 bottom-3 z-10 max-h-44 overflow-hidden rounded-xl" dir="ltr">
                  <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                      <Terminal className="h-3 w-3 text-aqua-300" />
                      sandbox console · {sandboxEngine}
                    </p>
                    <div className="flex items-center gap-1">
                      <button type="button" aria-label="مسح السجل" className="text-slate-500 transition hover:text-white" onClick={() => setConsoleLog([])}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="إغلاق" className="text-slate-500 transition hover:text-white" onClick={() => setConsoleOpen(false)}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="scroll-y max-h-32 overflow-y-auto px-3 py-1.5 font-mono text-[11px] leading-relaxed">
                    {consoleLog.length === 0 ? (
                      <p className="text-slate-600">console output appears here…</p>
                    ) : (
                      consoleLog.map((e, i) => (
                        <p
                          key={i}
                          className={cn(
                            "truncate",
                            e.kind === "error" || e.level === "error"
                              ? "text-rose-300"
                              : e.level === "warn"
                                ? "text-amber-200"
                                : e.kind === "ready"
                                  ? "text-emerald-300"
                                  : "text-slate-300"
                          )}
                          title={e.text}
                        >
                          {e.kind === "error" ? "✕ " : e.kind === "ready" ? "✓ " : ""}
                          {e.text}
                          {e.line ? `:${e.line}` : ""}
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )}

              {mode === "visual" && doc && (
                <div className="glass-deep absolute inset-x-3 bottom-3 z-10 rounded-xl p-3 sm:inset-x-auto sm:end-6 sm:w-72">
                  {sel ? (
                    <div className="space-y-2.5">
                      <p className="text-xs font-semibold text-white">
                        &lt;{sel.tag}&gt;
                        <span className="ms-2 font-normal text-slate-500">نقرتان لتحرير النص مباشرة</span>
                      </p>
                      {sel.text !== "" && (
                        <input
                          className="input-base !py-1.5 !text-sm"
                          dir="auto"
                          defaultValue={sel.text}
                          key={sel.text + sel.tag}
                          onChange={(e) => send({ type: "text", value: e.target.value })}
                          aria-label="النص"
                        />
                      )}
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <label className="flex items-center gap-1.5">
                          النص
                          <input type="color" defaultValue="#ffffff" onChange={(e) => send({ type: "style", prop: "color", value: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-brand-400/30 bg-transparent" />
                        </label>
                        <label className="flex items-center gap-1.5">
                          الخلفية
                          <input type="color" defaultValue="#0a0a0a" onChange={(e) => send({ type: "style", prop: "backgroundColor", value: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-brand-400/30 bg-transparent" />
                        </label>
                        <label className="flex flex-1 items-center gap-1.5">
                          الحجم
                          <input type="range" min={10} max={72} defaultValue={sel.size} key={sel.tag + sel.size} onChange={(e) => send({ type: "style", prop: "fontSize", value: `${e.target.value}px` })} className="w-full accent-white" />
                        </label>
                      </div>
                      <div className="space-y-1.5 rounded-lg border border-amber-300/30 bg-amber-300/[0.06] p-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                          <Wand2 className="h-3.5 w-3.5" />
                          عدّل هذا العنصر بالذكاء الاصطناعي{sel.comp ? ` · ${sel.comp}` : ""}
                        </p>
                        {sel.outer ? (
                          <>
                            <textarea
                              rows={2}
                              dir="auto"
                              value={aiAsk}
                              onChange={(e) => setAiAsk(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  void patchSelected();
                                }
                              }}
                              placeholder="مثال: اجعل الزر بنفسجياً متوهجاً"
                              className="input-base !py-1.5 !text-sm"
                              aria-label="طلب تعديل العنصر"
                            />
                            <button type="button" disabled={aiBusy || aiAsk.trim().length < 2} onClick={() => void patchSelected()} className={cn(act, "w-full justify-center disabled:opacity-50")}>
                              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                              {aiBusy ? "جاري التعديل…" : "طبّق على العنصر فقط"}
                            </button>
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-400">العنصر كبير جداً — اختر عنصراً أصغر داخله.</p>
                        )}
                        {aiErr && <p className="text-[11px] text-rose-300">{aiErr}</p>}
                      </div>
                      <button type="button" className={cn(act, "w-full justify-center")} onClick={() => { send({ type: "delete" }); setSel(null); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                        حذف العنصر
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-400">اضغط على أي عنصر في الصفحة لتعديل نصه ولونه وحجمه. تُحفظ التعديلات في الملفات والتصدير تلقائياً.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {empty && <span className="sr-only">لا يوجد مشروع بعد</span>}
    </div>
  );
}

function Empty() {
  return (
    <div className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <p className="text-sm font-semibold text-white">لا يوجد مشروع بعد</p>
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">صف ما تريد بناءه بالكتابة أو الصوت أو بإرفاق صورة، وسترى النتيجة تُبنى لحظة بلحظة.</p>
      </div>
    </div>
  );
}

