"use client";

import { Check, Copy } from "lucide-react";
import { memo, useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { copyText } from "./ui";

function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const text = ref.current?.textContent ?? "";
    if (await copyText(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="group relative my-2 overflow-hidden rounded-xl border border-white/10 bg-black/45">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-1">
        <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-600">
          code
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
          aria-label="نسخ الكود"
        >
          {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          {copied ? "تم النسخ" : "نسخ"}
        </button>
      </div>
      <pre
        ref={ref}
        dir="ltr"
        className="overflow-x-auto p-3 text-left font-mono text-[12px] leading-6 text-slate-200"
      >
        {children}
      </pre>
    </div>
  );
}

const components: Components = {
  p({ children }) {
    return <p dir="auto" className="mb-2 leading-7 last:mb-0">{children}</p>;
  },
  h1({ children }) {
    return <h1 dir="auto" className="mb-1.5 mt-3 text-base font-bold text-white first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 dir="auto" className="mb-1.5 mt-3 text-[15px] font-bold text-white first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return <h3 dir="auto" className="mb-1 mt-2.5 text-sm font-semibold text-slate-100 first:mt-0">{children}</h3>;
  },
  h4({ children }) {
    return <h4 dir="auto" className="mb-1 mt-2 text-[13px] font-semibold text-slate-200">{children}</h4>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-white">{children}</strong>;
  },
  em({ children }) {
    return <em className="text-slate-300">{children}</em>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="break-all font-medium text-cyan-300 underline decoration-cyan-400/30 underline-offset-2 transition hover:text-cyan-200"
      >
        {children}
      </a>
    );
  },
  ul({ children }) {
    return <ul dir="auto" className="mb-2 list-disc space-y-1 ps-5 leading-7 last:mb-0">{children}</ul>;
  },
  ol({ children }) {
    return <ol dir="auto" className="mb-2 list-decimal space-y-1 ps-5 leading-7 last:mb-0">{children}</ol>;
  },
  li({ children }) {
    return <li dir="auto" className="ps-0.5">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote dir="auto" className="my-2 border-s-2 border-white/15 bg-white/[0.02] px-3 py-1.5 text-slate-300">
        {children}
      </blockquote>
    );
  },
  code({ className, children }) {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return <code className="font-mono text-[12px]">{children}</code>;
    }
    return (
      <code
        dir="ltr"
        className="inline-block rounded-md border border-white/[0.06] bg-white/[0.07] px-1.5 py-0.5 text-left font-mono text-[0.88em] text-cyan-200"
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <CodeBlock>{children}</CodeBlock>;
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full border-collapse text-[12px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-white/[0.04]">{children}</thead>;
  },
  th({ children }) {
    return <th className="border-b border-white/10 px-2.5 py-1.5 text-start font-semibold text-slate-200">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-white/[0.05] px-2.5 py-1.5 align-top text-slate-300">{children}</td>;
  },
  tr({ children }) {
    return <tr className="last:[&>td]:border-b-0">{children}</tr>;
  },
  hr() {
    return <hr className="my-3 border-white/10" />;
  },
  input({ checked, type }) {
    if (type === "checkbox") {
      return <input type="checkbox" checked={Boolean(checked)} readOnly className="me-1.5 accent-cyan-400" />;
    }
    return null;
  },
  img({ src, alt }) {
    if (typeof src !== "string") return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt ?? ""}
        loading="lazy"
        className="my-2 max-h-80 max-w-full rounded-xl border border-white/10 object-contain"
      />
    );
  },
};

export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="text-[13.5px] text-slate-300">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
