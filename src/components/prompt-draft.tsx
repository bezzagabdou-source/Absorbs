"use client";

import { useState } from "react";
import { Check, Copy, FileText } from "lucide-react";

/**
 * Ready-to-use prompt shown as a "draft" card with one-tap copy.
 * The model wraps every prompt it writes for the user in a ```prompt fenced block.
 */
export function PromptDraft({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-300/[0.07] to-brand-500/[0.07]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-black text-amber-200">
          <FileText className="h-4 w-4" aria-hidden />
          مسودة برومبت
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-[12.5px] font-black text-white transition active:scale-95 hover:bg-white/15"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-300" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "تم النسخ" : "نسخ"}
        </button>
      </div>
      <p dir="auto" className="whitespace-pre-wrap break-words px-3.5 py-3 text-[15px] leading-[1.8] text-slate-100">
        {text}
      </p>
    </div>
  );
}
