"use client";

import { AlertTriangle, Ban, Check, CheckCheck, HelpCircle, Send } from "lucide-react";
import { useState } from "react";
import type { PermissionRequest, QuestionRequest } from "@/lib/opencode/types";
import { Badge, Spinner, cn } from "./ui";

function permissionDetail(permission: PermissionRequest): string | null {
  const metadata = permission.metadata ?? {};
  const candidates = [metadata.command, metadata.path, metadata.filePath, metadata.url, metadata.description];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

export function PermissionCard({
  permission,
  onReply,
}: {
  permission: PermissionRequest;
  onReply: (reply: "once" | "always" | "reject") => Promise<void>;
}) {
  const [busy, setBusy] = useState<"once" | "always" | "reject" | null>(null);
  const detail = permissionDetail(permission);

  const reply = async (value: "once" | "always" | "reject") => {
    setBusy(value);
    try {
      await onReply(value);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.055] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300">
          <AlertTriangle className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-[11.5px] font-semibold text-amber-100">OpenCode يطلب إذناً</p>
            <Badge tone="amber">{permission.permission}</Badge>
          </div>
          {detail && (
            <pre
              dir="ltr"
              className="mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-white/[0.06] bg-black/30 p-2 text-left font-mono text-[10.5px] leading-5 text-amber-100/80"
            >
              {detail}
            </pre>
          )}
          {permission.patterns.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {permission.patterns.slice(0, 6).map((pattern) => (
                <span
                  key={pattern}
                  dir="ltr"
                  className="rounded border border-white/[0.06] bg-black/20 px-1.5 py-0.5 font-mono text-[9.5px] text-slate-400"
                >
                  {pattern}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => void reply("once")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[10.5px] font-medium text-emerald-200 transition hover:bg-emerald-400/15 disabled:opacity-50"
        >
          {busy === "once" ? <Spinner className="size-3" /> : <Check className="size-3" />}
          سماح مرة واحدة
        </button>
        <button
          type="button"
          onClick={() => void reply("always")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10.5px] font-medium text-slate-300 transition hover:bg-white/[0.08] disabled:opacity-50"
        >
          {busy === "always" ? <Spinner className="size-3" /> : <CheckCheck className="size-3" />}
          سماح دائماً
        </button>
        <button
          type="button"
          onClick={() => void reply("reject")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-2.5 py-1.5 text-[10.5px] font-medium text-rose-300 transition hover:bg-rose-400/10 disabled:opacity-50"
        >
          {busy === "reject" ? <Spinner className="size-3" /> : <Ban className="size-3" />}
          رفض
        </button>
      </div>
    </div>
  );
}

export function QuestionCard({
  question,
  onReply,
}: {
  question: QuestionRequest;
  onReply: (answers: string[][]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [custom, setCustom] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);

  const toggle = (index: number, label: string, multiple?: boolean) => {
    setSelected((prev) => {
      const current = prev[index] ?? [];
      if (multiple) {
        return {
          ...prev,
          [index]: current.includes(label)
            ? current.filter((value) => value !== label)
            : [...current, label],
        };
      }
      return { ...prev, [index]: [label] };
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const answers = question.questions.map((item, index) => {
        const values = selected[index] ?? [];
        if (values.length > 0) return values;
        const text = (custom[index] ?? "").trim();
        return text ? [text] : [];
      });
      await onReply(answers);
    } finally {
      setBusy(false);
    }
  };

  const hasAnswer = question.questions.some((item, index) => {
    const values = selected[index] ?? [];
    return values.length > 0 || (custom[index] ?? "").trim().length > 0 || item.options.length === 0;
  });

  return (
    <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
          <HelpCircle className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold text-cyan-100">OpenCode يحتاج توضيحاً</p>
          <div className="mt-2 space-y-3">
            {question.questions.map((item, index) => (
              <div key={`${item.header}-${index}`}>
                <p className="text-[11px] font-medium text-slate-200">{item.header}</p>
                <p className="mt-0.5 text-[10.5px] leading-5 text-slate-400">{item.question}</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {item.options.map((option) => {
                    const active = (selected[index] ?? []).includes(option.label);
                    return (
                      <button
                        key={option.label}
                        type="button"
                        title={option.description}
                        onClick={() => toggle(index, option.label, item.multiple)}
                        className={cn(
                          "rounded-lg border px-2 py-1 text-[10.5px] transition",
                          active
                            ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                            : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {item.custom && (
                  <input
                    value={custom[index] ?? ""}
                    onChange={(event) =>
                      setCustom((prev) => ({ ...prev, [index]: event.target.value }))
                    }
                    placeholder="إجابة مخصصة…"
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/25 px-2.5 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-600 focus:border-cyan-400/30 focus:outline-none"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex justify-end">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !hasAnswer}
          className="inline-flex items-center gap-1 rounded-lg border border-cyan-400/25 bg-cyan-400/10 px-2.5 py-1.5 text-[10.5px] font-medium text-cyan-200 transition hover:bg-cyan-400/15 disabled:opacity-40"
        >
          {busy ? <Spinner className="size-3" /> : <Send className="size-3 -scale-x-100" />}
          إرسال الإجابة
        </button>
      </div>
    </div>
  );
}
