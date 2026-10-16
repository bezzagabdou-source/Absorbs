"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, Terminal } from "lucide-react";
import js from "highlight.js/lib/languages/javascript";
import ts from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import cs from "highlight.js/lib/languages/csharp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import php from "highlight.js/lib/languages/php";
import ruby from "highlight.js/lib/languages/ruby";
import swift from "highlight.js/lib/languages/swift";
import kotlin from "highlight.js/lib/languages/kotlin";
import md from "highlight.js/lib/languages/markdown";
import plaintext from "highlight.js/lib/languages/plaintext";
import yaml from "highlight.js/lib/languages/yaml";
import dockerfile from "highlight.js/lib/languages/dockerfile";

/* Only the languages AI answers actually use — the default plugin bundles ALL
   of highlight.js (~1MB) which slowed down first load. */
const LANGS: Record<string, unknown> = {
  javascript: js,
  jsx: js,
  typescript: ts,
  tsx: ts,
  python: python,
  bash: bash,
  sh: bash,
  shell: bash,
  zsh: bash,
  json: json,
  xml: xml,
  html: xml,
  css: css,
  sql: sql,
  java: java,
  c: c,
  cpp: cpp,
  "c++": cpp,
  csharp: cs,
  "c#": cs,
  go: go,
  rust: rust,
  php: php,
  ruby: ruby,
  swift: swift,
  kotlin: kotlin,
  markdown: md,
  text: plaintext,
  plain: plaintext,
  plaintext,
  yaml: yaml,
  yml: yaml,
  dockerfile,
};

function extractText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (typeof node === "object" && "props" in node) {
    return extractText((node as { props: { children?: ReactNode } }).props.children);
  }
  return "";
}

function CodeBlock({ language, children }: { language: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const raw = useMemo(() => extractText(children).replace(/\n$/, ""), [children]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = raw;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="codeblock" dir="ltr">
      <div className="flex items-center justify-between border-b border-(--code-line) bg-white/[0.03] px-4 py-2">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[#93a1d8] uppercase">
          <Terminal className="size-3.5 text-(--accent)" />
          {language || "code"}
        </span>
        <button
          onClick={copy}
          className="press flex cursor-pointer items-center gap-1.5 rounded-lg border border-(--code-line) bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-[#b6c2ef] transition-colors hover:bg-white/[0.09] hover:text-white"
        >
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre dir="ltr" className="scroll-slim text-left">
        {children}
      </pre>
    </div>
  );
}

export const Markdown = memo(function Markdown({ text, dir }: { text: string; dir?: string }) {
  return (
    <div className="md" dir={dir ?? "auto"}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { languages: LANGS as never, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => {
            const child = Array.isArray(children) ? children[0] : children;
            const cls =
              (child as { props?: { className?: string } } | undefined)?.props?.className ?? "";
            const lang = /language-([\w-]+)/.exec(cls)?.[1] ?? "";
            const codeChildren = (child as { props?: { children?: ReactNode } } | undefined)?.props
              ?.children;
            return <CodeBlock language={lang}><code className={cls}>{codeChildren}</code></CodeBlock>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
