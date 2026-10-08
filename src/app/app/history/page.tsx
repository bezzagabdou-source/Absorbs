"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  History as HistoryIcon,
  MessagesSquare,
  PenLine,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { getTool, loc } from "@/lib/tools";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";

type Conv = { id: string; title: string; updatedAt: string };
type Run = {
  id: string;
  tool: string;
  title: string;
  output: string;
  createdAt: string;
};

export default function HistoryPage() {
  const { t, locale } = useI18n();
  const { authFetch } = useAuth();
  const [tab, setTab] = useState<"chats" | "runs">("chats");
  const [convs, setConvs] = useState<Conv[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [openRun, setOpenRun] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await authFetch("/api/history");
        if (res.ok) {
          const data = (await res.json()) as {
            conversations: Conv[];
            runs: Run[];
          };
          setConvs(data.conversations);
          setRuns(data.runs);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [authFetch]);

  const fmt = (iso: string) => {
    try {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : locale, {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  };

  const emptyState = (
    <div className="grid place-items-center py-20 text-center">
      <HistoryIcon className="mb-4 h-10 w-10 text-slate-600" />
      <p className="max-w-xs text-sm text-slate-500">{t.app.emptyHistory}</p>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-white sm:text-3xl">
          {t.app.historyTitle}
        </h1>
        <p className="mt-2 text-slate-400">{t.app.historySub}</p>
      </motion.div>

      {/* tabs */}
      <div className="glass my-7 flex w-fit rounded-2xl p-1">
        {(["chats", "runs"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition",
              tab === k
                ? "bg-gradient-to-r from-brand-500 to-aqua-400 text-[#fff] shadow-lg"
                : "text-slate-400 hover:text-white"
            )}
          >
            {k === "chats" ? (
              <MessagesSquare className="h-4 w-4" />
            ) : (
              <PenLine className="h-4 w-4" />
            )}
            {k === "chats" ? t.app.chatsTab : t.app.runsTab}
            <span className="rounded-md bg-white/10 px-1.5 text-[10px] font-black">
              {k === "chats" ? convs.length : runs.length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="shimmer-line h-16 rounded-2xl" />
          ))}
        </div>
      ) : tab === "chats" ? (
        convs.length === 0 ? (
          emptyState
        ) : (
          <div className="space-y-2.5">
            {convs.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Link
                  href={`/app?c=${c.id}`}
                  className="glass group flex items-center gap-4 rounded-2xl px-5 py-4 transition hover:border-brand-400/30"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                    <MessagesSquare className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {c.title || t.app.newChat}
                    </p>
                    <p className="text-xs text-slate-500">{fmt(c.updatedAt)}</p>
                  </div>
                  <span className="rounded-xl border border-white/10 px-3.5 py-1.5 text-xs font-bold text-slate-300 transition group-hover:border-brand-400/40 group-hover:text-brand-300">
                    {t.app.viewChat}
                  </span>
                </Link>
              </motion.div>
            ))}
          </div>
        )
      ) : runs.length === 0 ? (
        emptyState
      ) : (
        <div className="space-y-3">
          {runs.map((r, i) => {
            const toolDef = getTool(r.tool);
            const open = openRun === r.id;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass overflow-hidden rounded-2xl"
              >
                <button
                  type="button"
                  onClick={() => setOpenRun(open ? null : r.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-start"
                >
                  {toolDef && (
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-300">
                      <toolDef.icon className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">
                      {r.title || (toolDef ? loc(toolDef.name, locale) : r.tool)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {toolDef ? loc(toolDef.name, locale) : r.tool} •{" "}
                      {fmt(r.createdAt)}
                    </p>
                  </div>
                  <ChevronDown
                    className={cn(
                      "h-5 w-5 shrink-0 text-slate-500 transition-transform",
                      open && "rotate-180 text-brand-300"
                    )}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      <div className="border-t border-white/8 px-5 py-5">
                        <Markdown>{r.output}</Markdown>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
