"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy, Terminal } from "lucide-react";

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
        rehypePlugins={[rehypeHighlight]}
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
