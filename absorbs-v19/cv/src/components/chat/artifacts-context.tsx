"use client";

import { createContext, useContext } from "react";

export type Artifact = { title?: string; lang: string; code: string };
export type ArtifactKind = "html" | "react" | "js" | "svg" | "markdown" | "code";

export type ArtifactsApi = {
  current: Artifact | null;
  open: (a: Artifact) => void;
  close: () => void;
};

export const ArtifactsContext = createContext<ArtifactsApi | null>(null);

/** null when no provider is mounted (e.g. tool pages) → callers hide the button. */
export const useArtifacts = () => useContext(ArtifactsContext);

export function artifactKind(lang: string, code: string): ArtifactKind {
  const l = lang.toLowerCase();
  if (/^(html|htm)$/.test(l)) return "html";
  if (l === "svg" || (l === "xml" && /^\s*<svg[\s>]/i.test(code))) return "svg";
  if (/^(jsx|tsx)$/.test(l)) return "react";
  if (/^(js|javascript|mjs)$/.test(l)) {
    return /\bfrom\s+["']react["']|\bReactDOM\b|<\w+[^>]*>[\s\S]*<\/\w+>|return\s*\(\s*</.test(code)
      ? "react"
      : "js";
  }
  if (/^(md|markdown)$/.test(l)) return "markdown";
  return "code";
}

/** Languages that get an "open in panel" button. */
export function isArtifactLang(lang: string, code: string): boolean {
  const k = artifactKind(lang, code);
  if (k === "html") return /<(canvas|script|body|div|svg|h1|p|section|main)/i.test(code);
  return k !== "code";
}
