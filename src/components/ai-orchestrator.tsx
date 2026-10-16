"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, CheckCircle2, Copy, GitBranch, Loader2, Network, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/auth-context";
import { readSSE } from "@/lib/sse";
import { Markdown } from "@/components/markdown";

interface SubTask {
  id: string;
  label: string;
  model: string;
  status: "pending" | "running" | "completed" | "failed";
  ms?: number;
  snippet?: string;
}

interface OrchestratorProps {
  onClose: () => void;
  initialPrompt?: string;
}

/**
 * Nexus Distribution — "الوضع التوزيع الذكي" (real version).
 *
 * The prompt is fanned out to up to three DIFFERENT engines in parallel
 * (live mode, with provider keys) or three local draft passes (no keys),
 * then merged into one final answer. Every status you see is real:
 * start / done / failed / latency come from the server over SSE.
 */
export function AIOrchestrator({ onClose, initialPrompt }: OrchestratorProps) {
  const [tasks, setTasks] = useState<SubTask[]>([]);
  const [mode, setMode] = useState<"idle" | "local" | "live">("idle");
  const [finalText, setFinalText] = useState("");
  const [finalEngine, setFinalEngine] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState(initialPrompt ?? "");

  const setTask = (id: string, patch: Partial<SubTask>) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const run = async (p: string) => {
    const text = p.trim();
    if (!text || running) return;
    setRunning(true);
    setTasks([]);
    setFinalText("");
    setFinalEngine(null);
    setFailed(null);
    setMode("idle");
    try {
      const res = await apiFetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok || !res.body) {
        setFailed(res.status === 429 ? "محاولات كثيرة — انتظر دقيقة." : "تعذّر الاتصال بالخادم.");
        return;
      }
      await readSSE(res, (event, data) => {
        if (event === "plan") {
          setMode(data.mode === "local" ? "local" : "live");
          const list = (data.tasks as { id: string; label: string; model: string }[]) ?? [];
          setTasks(list.map((t) => ({ ...t, status: "pending" })));
        } else if (event === "task") {
          const id = String(data.id ?? "");
          if (data.status === "start") setTask(id, { status: "running" });
          else if (data.status === "done") setTask(id, { status: "completed", ms: data.ms as number | undefined, snippet: data.snippet as string | undefined });
          else if (data.status === "failed") setTask(id, { status: "failed", ms: data.ms as number | undefined });
        } else if (event === "final") {
          if (data.ok) {
            setFinalText(String(data.text ?? ""));
            setFinalEngine((data.engine as string) ?? null);
          } else {
            setFailed("فشل كل المحركات — تحقق من مفاتيح API أو أعد المحاولة.");
          }
        }
      });
    } catch {
      setFailed("تعذّر الاتصال بالخادم.");
    } finally {
      setRunning(false);
    }
  };

  const copyFinal = () => {
    navigator.clipboard
      .writeText(finalText)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  const done = tasks.length > 0 && tasks.every((t) => t.status === "completed" || t.status === "failed");
  const anyDone = finalText.length > 0 || !!failed;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl mx-4 overflow-hidden rounded-3xl border border-(--line) bg-(--panel-solid) shadow-2xl flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="relative border-b border-(--line) bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-transparent p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/30">
                  <Network className="size-5 text-white" />
                </div>
                {running && <div className="absolute -inset-1 rounded-2xl bg-indigo-500/30 animate-ping" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-(--ink)">الموزّع الذكي</h2>
                <p className="text-[11.5px] text-(--ink-3)">
                  {running
                    ? mode === "local"
                      ? "تشغيل المسارات المحلية بالتوازي..."
                      : "توزيع الطلب على المحركات بالتوازي..."
                    : "الطلب ينفَّذ على عدة محركات ويُدمج في نتيجة واحدة"}
                </p>
              </div>
            </div>
            <button onClick={onClose} aria-label="إغلاق" className="grid size-9 cursor-pointer place-items-center rounded-xl bg-(--glass-hi) text-(--ink-2) hover:bg-(--glass-hi)/80 transition">
              <X className="size-4.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* prompt */}
          <div className="mb-4 flex gap-2">
            <input
              type="text"
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run(inputPrompt)}
              disabled={running}
              placeholder="اكتب الطلب — مثال: خطّة إطلاق تطبيق توصيل في الجزائر"
              className="flex-1 rounded-xl border border-(--line) bg-(--glass-hi) px-4 py-2.5 text-[13px] text-(--ink) placeholder:text-(--ink-3) focus:border-indigo-500/50 focus:outline-none"
              dir="auto"
            />
            <button
              onClick={() => void run(inputPrompt)}
              disabled={running || !inputPrompt.trim()}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition",
                running || !inputPrompt.trim()
                  ? "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
                  : "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30 hover:scale-105"
              )}
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
              {running ? "جاري التنفيذ..." : "تشغيل"}
            </button>
          </div>

          {/* tasks */}
          {tasks.length > 0 && (
            <div className="space-y-2.5">
              {tasks.map((task, idx) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.06 }}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-3.5 transition-all",
                    task.status === "running"
                      ? "border-indigo-500/40 bg-indigo-500/5"
                      : task.status === "completed"
                        ? "border-emerald-500/25 bg-emerald-500/5"
                        : task.status === "failed"
                          ? "border-red-500/25 bg-red-500/5"
                          : "border-(--line) bg-(--glass-hi)"
                  )}
                >
                  <div
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-xl",
                      task.status === "completed" ? "bg-emerald-500/20" : task.status === "failed" ? "bg-red-500/15" : "bg-(--accent)/10"
                    )}
                  >
                    {task.status === "running" ? (
                      <Loader2 className="size-4.5 animate-spin text-indigo-400" />
                    ) : task.status === "completed" ? (
                      <CheckCircle2 className="size-4.5 text-emerald-400" />
                    ) : task.status === "failed" ? (
                      <X className="size-4.5 text-red-400" />
                    ) : (
                      <Network className="size-4.5 text-(--accent)" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-[13px] font-semibold text-(--ink)">{task.label}</h4>
                      {task.status === "completed" && typeof task.ms === "number" && (
                        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-400" dir="ltr">
                          {task.ms}ms
                        </span>
                      )}
                      {task.status === "failed" && <span className="text-[10px] text-red-400">فشل</span>}
                    </div>
                    <p className="text-[10.5px] text-(--ink-3) truncate" dir="ltr">
                      {task.model}
                    </p>
                  </div>
                  {task.snippet && (
                    <span className="hidden max-w-40 truncate text-[10px] text-(--ink-3) sm:block" dir="auto">
                      {task.snippet}
                    </span>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          {/* merging indicator */}
          {mode === "live" && running && done && (
            <div className="mt-4 flex items-center gap-2.5 rounded-2xl border border-purple-500/25 bg-purple-500/5 p-3.5">
              <GitBranch className="size-4.5 animate-pulse text-purple-400" />
              <span className="text-[12.5px] text-(--ink)">دمج نتائج المحركات في إجابة واحدة...</span>
            </div>
          )}

          {/* final */}
          {finalText && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-[12px] font-bold uppercase tracking-wider text-(--ink-3)">النتيجة النهائية</h4>
                <div className="flex items-center gap-2">
                  {finalEngine && (
                    <span className="text-[10px] text-(--ink-3)" dir="ltr">
                      {finalEngine}
                    </span>
                  )}
                  <button
                    onClick={copyFinal}
                    className="flex cursor-pointer items-center gap-1 rounded-lg bg-(--glass-hi) px-2.5 py-1 text-[11px] font-semibold text-(--ink-2) hover:text-(--ink) transition"
                  >
                    {copied ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
                    {copied ? "نُسخ" : "نسخ"}
                  </button>
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-2xl border border-(--line) bg-(--glass-hi) p-4">
                <Markdown text={finalText} />
              </div>
            </motion.div>
          )}

          {failed && <p className="mt-4 rounded-xl bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{failed}</p>}

          {/* note when idle */}
          {tasks.length === 0 && !running && !finalText && (
            <div className="mt-6 grid place-items-center rounded-2xl border border-dashed border-(--line) py-10 text-center">
              <Brain className="size-10 text-(--ink-3) opacity-60" />
              <p className="mt-3 max-w-sm px-4 text-[12.5px] leading-relaxed text-(--ink-3)">
                اكتب طلبًا وشغّل التوزيع — سيُنفَّذ على عدة محركات بالتوازي ثم تُدمج النتائج في إجابة واحدة أقوى.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-(--line) p-4">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] text-(--ink-3)">
              {mode === "local" ? "وضع محلي — بدون مفاتيح API" : mode === "live" ? "محركات خارجية حقيقية" : "جاهز"}
            </span>
            <button
              onClick={onClose}
              disabled={!anyDone && !running}
              className={cn(
                "cursor-pointer rounded-xl px-6 py-2 text-[13px] font-semibold transition",
                anyDone
                  ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/30"
                  : "bg-(--glass-hi) text-(--ink-3) cursor-not-allowed"
              )}
            >
              {running ? "جاري المعالجة..." : "إغلاق"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
