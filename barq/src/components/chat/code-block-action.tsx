"use client";

import { useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Copy, Download, Maximize2, PanelRightOpen, Play, WrapText } from "lucide-react";
import { usePro } from "@/lib/pro-i18n";
import { FullPreview, GamePreview } from "@/components/game-preview";
import { useArtifacts, isArtifactLang } from "@/components/chat/artifacts-context";
import { cn } from "@/lib/utils";

const EXT: Record<string, string> = {
  javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
  python: "py", py: "py", html: "html", css: "css", json: "json", bash: "sh",
  sh: "sh", sql: "sql", php: "php", java: "java", go: "go", rust: "rs", c: "c",
  cpp: "cpp", csharp: "cs", cs: "cs", kotlin: "kt", swift: "swift", ruby: "rb",
  yaml: "yml", yml: "yml", markdown: "md", md: "md", svg: "svg",
};

const LABEL: Record<string, string> = {
  js: "JavaScript", javascript: "JavaScript", ts: "TypeScript", typescript: "TypeScript",
  tsx: "TSX", jsx: "JSX", py: "Python", python: "Python", html: "HTML", htm: "HTML",
  css: "CSS", json: "JSON", bash: "Bash", sh: "Shell", sql: "SQL", php: "PHP",
  java: "Java", go: "Go", rust: "Rust", c: "C", cpp: "C++", cs: "C#", csharp: "C#",
  kotlin: "Kotlin", swift: "Swift", ruby: "Ruby", yaml: "YAML", yml: "YAML",
  md: "Markdown", markdown: "Markdown", svg: "SVG", xml: "XML",
};

/** Small coloured dot next to the language name. */
const DOT: Record<string, string> = {
  js: "bg-yellow-400", javascript: "bg-yellow-400", ts: "bg-blue-400", typescript: "bg-blue-400",
  tsx: "bg-sky-400", jsx: "bg-cyan-400", py: "bg-emerald-400", python: "bg-emerald-400",
  html: "bg-orange-400", htm: "bg-orange-400", css: "bg-indigo-400", json: "bg-amber-300",
  bash: "bg-slate-300", sh: "bg-slate-300", sql: "bg-fuchsia-400", php: "bg-violet-400",
  java: "bg-red-400", go: "bg-cyan-300", rust: "bg-orange-300", svg: "bg-pink-400",
};

export function CodeBlockAction({
  lang,
  code,
  pro,
  children,
}: {
  lang: string;
  code: string;
  pro: boolean;
  /** Pre-highlighted <span> tree from rehype-highlight (falls back to plain text). */
  children?: ReactNode;
}) {
  const p = usePro();
  const artifacts = useArtifacts();
  const [copied, setCopied] = useState(false);
  const [play, setPlay] = useState(false);
  const [full, setFull] = useState(false);
  const [wrap, setWrap] = useState(false);

  const key = lang.toLowerCase();
  const isHtml = /^(html|htm)$/.test(key);
  const canPlay = pro && isHtml && /<(canvas|script|body|div)/i.test(code);
  const canOpen = pro && !!artifacts && isArtifactLang(lang, code);
  const lines = code.split("\n").length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // older WebViews: fall back to a hidden textarea
      try {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.style.cssText = "position:fixed;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      } catch {
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `barq-code.${EXT[key] ?? "txt"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const btn = cn(
    "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-bold transition active:scale-95",
    "text-slate-600 hover:bg-slate-900/8 hover:text-slate-900",
    "dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
  );

  return (
    <div className="my-3 overflow-hidden rounded-[0.9rem] border border-slate-900/12 shadow-sm dark:border-white/10">
      <div
        dir="ltr"
        className="flex items-center justify-between gap-2 border-b border-slate-900/10 bg-slate-100/80 px-3 py-1 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.05]"
      >
        <span className="flex min-w-0 items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-300">
          <span className={cn("size-2 shrink-0 rounded-full", DOT[key] ?? "bg-slate-400")} />
          <span className="truncate">{LABEL[key] ?? (lang || "code")}</span>
          <span className="font-medium text-slate-400 dark:text-slate-500">{lines} lines</span>
        </span>

        <div className="flex shrink-0 items-center gap-0.5">
          {canOpen && (
            <button
              type="button"
              className={btn}
              onClick={() => artifacts?.open({ lang, code })}
              aria-label="Open in side panel"
            >
              <PanelRightOpen className="size-3.5 text-brand-500 dark:text-brand-300" />
              <span className="hidden sm:inline">Artifact</span>
            </button>
          )}
          {canPlay && !canOpen && (
            <button type="button" className={btn} onClick={() => setPlay((v) => !v)}>
              <Play className="size-3.5 text-brand-500 dark:text-brand-300" />
              {play ? p.gameCode : p.codePreview}
            </button>
          )}
          {canPlay && (
            <button type="button" className={btn} onClick={() => setFull(true)}>
              <Maximize2 className="size-3.5 text-amber-500 dark:text-amber-300" />
              <span className="hidden sm:inline">شاشة كاملة</span>
            </button>
          )}
          <button
            type="button"
            className={cn(btn, wrap && "bg-slate-900/8 dark:bg-white/10")}
            onClick={() => setWrap((v) => !v)}
            aria-pressed={wrap}
            aria-label="Wrap lines"
          >
            <WrapText className="size-3.5" />
          </button>
          <button type="button" className={btn} onClick={download} aria-label={p.codeDownload}>
            <Download className="size-3.5" />
            <span className="hidden sm:inline">{p.codeDownload}</span>
          </button>
          <button type="button" className={btn} onClick={() => void copy()} aria-label={p.codeCopy}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={copied ? "ok" : "copy"}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.12 }}
                className="grid place-items-center"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </motion.span>
            </AnimatePresence>
            {copied ? p.codeCopied : p.codeCopy}
          </button>
        </div>
      </div>

      {full && <FullPreview html={code} onClose={() => setFull(false)} />}
      {play ? (
        <GamePreview html={code} className="rounded-t-none" />
      ) : (
        <pre
          className={cn(
            "!m-0 !rounded-none !border-0 !bg-[#05041a]",
            wrap && "!whitespace-pre-wrap !break-words"
          )}
        >
          <code className={cn("hljs", lang && `language-${lang}`)}>{children ?? code}</code>
        </pre>
      )}
    </div>
  );
}
