"use client";

import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import { CodeBlock } from "@/components/code-block";
import { PromptDraft } from "@/components/prompt-draft";
import { defaultUrlTransform } from "react-markdown";

function textOf(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement(node)) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return "";
}

// single "$" is NOT math, so prices like "$5 and $10" stay plain text
const MATH_OPTS = { singleDollarTextMath: false };
const KATEX_OPTS = { throwOnError: false, strict: false, output: "htmlAndMathml" as const };
const HL_OPTS = { detect: false, ignoreMissing: true };

/** `pro` unlocks live preview / artifacts on code blocks. */
export function Markdown({
  children,
  pro = false,
  plainCode = false,
}: {
  children: string;
  pro?: boolean;
  /** true while streaming: skip toolbar + highlighting so half-written code doesn't flicker */
  plainCode?: boolean;
}) {
  const components: Components = {
    pre({ children: c }) {
      const el = Array.isArray(c) ? c[0] : c;
      if (!plainCode && isValidElement(el)) {
        const props = el.props as { className?: string; children?: ReactNode };
        const lang = /language-([\w+-]+)/.exec(props.className ?? "")?.[1] ?? "";
        const code = textOf(props.children).replace(/\n$/, "");
        // while streaming, a fence can exist with no content yet → never paint an empty black box
        if (!code.trim()) return null;
        if (lang === "prompt") return <PromptDraft text={code} />;
        return (
          <CodeBlock lang={lang} code={code} pro={pro}>
            {props.children}
          </CodeBlock>
        );
      }
      if (!textOf(c).trim()) return null;
      return <pre>{c}</pre>;
    },
    img({ src, alt }) {
      const url = typeof src === "string" ? src : "";
      if (!url) return null;
      return (
        <span className="chat-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={alt ?? ""} loading="lazy" />
          <a href={url} download="nexus-image.png" className="chat-img-dl">تنزيل</a>
        </span>
      );
    },
    table({ children: c }) {
      return (
        <div className="md-table">
          <table>{c}</table>
        </div>
      );
    },
  };
  return (
    <div dir="auto" className="md-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, MATH_OPTS]]}
        rehypePlugins={
          plainCode
            ? [[rehypeKatex, KATEX_OPTS]]
            : [
                [rehypeKatex, KATEX_OPTS],
                [rehypeHighlight, HL_OPTS],
              ]
        }
        components={components}
        urlTransform={(u) => (u.startsWith("blob:") ? u : defaultUrlTransform(u))}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
