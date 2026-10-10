"use client";

/**
 * Nexus AI v13 — DEEP RESEARCH.
 * Live web search with numbered, clickable citations.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Search,
  Square,
  Telescope,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import type { ResearchEvent } from "@/app/api/ai/research/route";
import { cn } from "@/lib/utils";

interface Src {
  n: number;
  title: string;
  url: string;
  host: string;
  snippet: string;
}
interface Step {
  id: string;
  label: string;
  state: "run" | "ok" | "fail";
}

/** Turn [1] [2] markers into clickable chips, safely (no dangerouslySetInnerHTML). */
function Cited({ text, sources }: { text: string; sources: Src[] }) {
  const parts = text.split(/(\[\d{1,2}\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = /^\[(\d{1,2})\]$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        const n = Number(m[1]);
        const src = sources.find((s) => s.n === n);
        if (!src) return <span key={i}>{p}</span>;
        return (
          <a
            key={i}
            href={src.url}
            target="_blank"
            rel="noopener noreferrer"
            className="v13-cite"
            title={src.title}
          >
            {n}
          </a>
        );
      })}
    </>
  );
}

export default function ResearchPage() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [depth, setDepth] = useState<"quick" | "deep">("quick");
  const [steps, setSteps] = useState<Step[]>([]);
  const [sources, setSources] = useState<Src[]>([]);
  const [report, setReport] = useState("");
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);
  const [secs, setSecs] = useState(0);

  const abort = useRef<AbortController | null>(null);
  const t0 = useRef(0);

  useEffect(() => {
    if (!busy) return;
    const i = setInterval(() => setSecs((Date.now() - t0.current) / 1000), 100);
    return () => clearInterval(i);
  }, [busy]);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !user) return;

    setErr("");
    setSteps([]);
    setSources([]);
    setReport("");
    setBusy(true);
    t0.current = Date.now();
    setSecs(0);

    const ctl = new AbortController();
    abort.current = ctl;

    let buf = "";
    const onLine = (line: string) => {
      let e: ResearchEvent;
      try {
        e = JSON.parse(line) as ResearchEvent;
      } catch {
        return;
      }
      switch (e.t) {
        case "plan":
          setProvider(e.provider);
          break;
        case "step":
          setSteps((prev) => {
            const i = prev.findIndex((s) => s.id === e.id);
            if (i < 0) return [...prev, { id: e.id, label: e.label, state: e.state }];
            const next = [...prev];
            next[i] = { id: e.id, label: e.label, state: e.state };
            return next;
          });
          break;
        case "sources":
          setSources(e.sources);
          break;
        case "report":
          setReport((r) => r + e.d);
          break;
        case "error":
          setErr(e.message);
          break;
      }
    };

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/ai/research", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, depth }),
        signal: ctl.signal,
      });
      if (!res.ok || !res.body) {
        setErr(res.status === 429 ? "وصلتي للحد. استنى شوية." : `فشل البحث (${res.status})`);
        setBusy(false);
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value ?? "";
        let nl = buf.indexOf("\n");
        while (nl >= 0) {
          const l = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (l) onLine(l);
          nl = buf.indexOf("\n");
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") setErr("انقطع الاتصال.");
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }, [input, busy, user, depth]);

  const copy = () => {
    const txt =
      report +
      "\n\nالمصادر:\n" +
      sources.map((s) => `[${s.n}] ${s.title} — ${s.url}`).join("\n");
    void navigator.clipboard?.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="v12-page v12-grain mx-auto w-full max-w-5xl px-4 pb-10 pt-5 sm:px-6">
      <div className="v12-sky" />

      <header className="v12-in mb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="v12-eyebrow">ميزة v13</span>
          <span className="v12-chip">
            <Globe className="h-3 w-3" /> {provider || "بحث حيّ"}
          </span>
        </div>
        <h1 className="v12-display text-[clamp(30px,6vw,46px)]">البحث العميق</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--v12-dim)]">
          كيفتّش فالإنترنت الحقيقي، كيقرا الصفحات كاملة، ويكتب ليك تقرير —
          وكل معلومة معاها <span className="v13-cite">1</span> رقم مصدر تقدر تنقر عليه وتتأكد بنفسك.
        </p>
      </header>

      {/* composer */}
      <div className="v12-card v12-ring v12-in p-3">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void run();
            }
          }}
          rows={3}
          disabled={busy}
          placeholder="شنو بغيتي نفتّشو عليه؟ مثلاً: شحال سعر الدولار فالجزائر اليوم؟"
          className="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-[var(--v12-text)] outline-none placeholder:text-[var(--v12-faint)]"
        />
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-1.5">
            {(["quick", "deep"] as const).map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => setDepth(d)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold transition",
                  depth === d
                    ? "border-[rgba(217,119,87,0.5)] bg-[rgba(217,119,87,0.16)] text-[var(--v12-text)]"
                    : "border-[var(--v12-line)] text-[var(--v12-faint)] hover:text-[var(--v12-text)]"
                )}
              >
                {d === "quick" ? "سريع · 3 صفحات" : "عميق · 5 صفحات"}
              </button>
            ))}
            {busy && (
              <span className="text-[11.5px] tabular-nums text-[var(--v12-faint)]">
                {secs.toFixed(1)}s
              </span>
            )}
          </div>
          {busy ? (
            <button
              type="button"
              onClick={() => abort.current?.abort()}
              className="v12-btn v12-btn-quiet !px-5 !py-2.5 !text-sm"
            >
              <Square className="h-3.5 w-3.5" /> وقّف
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!input.trim()}
              className="v12-btn v12-btn-primary !px-5 !py-2.5 !text-sm disabled:opacity-40"
            >
              <Telescope className="h-4 w-4" /> ابدا البحث
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="v12-card mt-3 flex items-start gap-2.5 border-red-400/35 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
          {err}
        </div>
      )}

      {/* steps */}
      {steps.length > 0 && (
        <section className="v12-card v12-in mt-4 p-4">
          {steps.map((s, i) => (
            <div key={s.id} className="v13-step relative" data-on={s.state}>
              <span className="v13-step-dot">
                {i < steps.length - 1 && <span className="v13-rail" />}
              </span>
              <span className="flex-1">{s.label}</span>
              {s.state === "run" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {s.state === "ok" && <Check className="h-3.5 w-3.5 text-emerald-400" />}
            </div>
          ))}
        </section>
      )}

      {/* sources */}
      {(sources.length > 0 || busy) && (
        <section className="mt-4">
          <h2 className="v12-group-title flex items-center gap-1.5">
            <Search className="h-3.5 w-3.5" /> المصادر {sources.length > 0 && `(${sources.length})`}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {sources.length === 0 && busy
              ? [0, 1, 2, 3].map((i) => <div key={i} className="v13-skel" />)
              : sources.map((s) => (
                  <a
                    key={s.n}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="v13-src v12-in"
                  >
                    <span className="v13-num">{s.n}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-[13px] font-semibold leading-snug text-[var(--v12-text)]">
                        {s.title}
                      </span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-[var(--v12-faint)]">
                        <ExternalLink className="h-3 w-3" />
                        {s.host}
                      </span>
                    </span>
                  </a>
                ))}
          </div>
        </section>
      )}

      {/* report */}
      {report && (
        <section className="v12-in mt-5">
          <h2 className="v12-group-title flex items-center gap-2">
            التقرير
            <button
              type="button"
              onClick={copy}
              className="ms-auto flex items-center gap-1 text-[11.5px] font-normal hover:text-[var(--v12-text)]"
            >
              {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
              {copied ? "تنسخ" : "نسخ مع المصادر"}
            </button>
          </h2>
          <div
            className={cn(
              "v12-card v12-ring whitespace-pre-wrap break-words p-5 text-[15px] leading-[1.9] text-[var(--v12-text)]",
              busy && "v12-caret"
            )}
          >
            <Cited text={report} sources={sources} />
          </div>
        </section>
      )}
    </div>
  );
}
