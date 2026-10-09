"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Download, FileText, FileType2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { downloadMarkdown, exportPdf, type ExportMessage } from "@/lib/export";

/** Download button with a Markdown / PDF choice. */
export function ExportMenu({
  messages,
  title,
  label = "تصدير المحادثة",
}: {
  messages: ExportMessage[];
  title?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const pick = (fn: () => void) => {
    setOpen(false);
    fn();
  };
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-start text-sm font-bold transition hover:bg-slate-900/8 dark:hover:bg-white/10";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="grid size-9 place-items-center rounded-xl border border-slate-900/10 bg-slate-900/5 text-slate-600 transition hover:text-slate-900 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:text-[#fff]"
      >
        <Download className="size-4" />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <GlassCard
              static
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute end-0 top-full z-50 mt-2 w-48 bg-white/95 p-1.5 dark:bg-ink-900/95"
            >
              <button type="button" className={item} onClick={() => pick(() => downloadMarkdown(messages, { title }))}>
                <FileText className="size-4 text-brand-500" />
                Markdown (.md)
              </button>
              <button type="button" className={item} onClick={() => pick(() => exportPdf(messages, { title }))}>
                <FileType2 className="size-4 text-rose-500" />
                PDF
              </button>
            </GlassCard>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
