"use client";

import {
  AlertCircle,
  AlertTriangle,
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  Paperclip,
  RotateCw,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { useState } from "react";
import type {
  Message,
  MessageError,
  Part,
  ReasoningPart,
  ToolPart,
  ToolState,
} from "@/lib/opencode/types";
import { Markdown } from "./markdown";
import { Badge, IconButton, copyText, formatTime, type BadgeTone } from "./ui";

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function textOf(value: unknown, max = 240): string {
  if (value == null) return "";
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

function toolStatusTone(status: ToolState["status"]): BadgeTone {
  switch (status) {
    case "completed":
      return "emerald";
    case "error":
      return "rose";
    case "running":
      return "amber";
    default:
      return "slate";
  }
}

function toolStatusLabel(status: ToolState["status"]): string {
  switch (status) {
    case "completed":
      return "مكتمل";
    case "error":
      return "خطأ";
    case "running":
      return "قيد التنفيذ";
    default:
      return "في الانتظار";
  }
}

function toolInputSummary(input: unknown): { label: string; value: string }[] {
  if (!input || typeof input !== "object") {
    const value = textOf(input);
    return value ? [{ label: "المدخل", value }] : [];
  }
  const record = input as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  const preferred: [string, string][] = [
    ["command", "الأمر"],
    ["description", "الوصف"],
    ["filePath", "الملف"],
    ["path", "المسار"],
    ["pattern", "النمط"],
    ["url", "الرابط"],
    ["query", "الاستعلام"],
    ["prompt", "الطلب"],
  ];
  for (const [key, label] of preferred) {
    const value = textOf(record[key], 600);
    if (value) rows.push({ label, value });
  }
  if (rows.length === 0) {
    const value = textOf(record, 600);
    if (value) rows.push({ label: "المدخل", value });
  }
  return rows;
}

function ToolCard({ part }: { part: ToolPart }) {
  const [copied, setCopied] = useState(false);
  const state = part.state ?? { status: "pending" as const };
  const inputs = toolInputSummary(state.input);
  const output = textOf(state.output, 4000);
  const rawError = state.error;
  const error =
    typeof rawError === "string" && rawError.trim()
      ? rawError
      : state.status === "error"
        ? "فشلت الأداة"
        : "";
  const primaryInput = inputs[0]?.value ?? "";

  const onCopy = async () => {
    if (await copyText(primaryInput)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="my-1.5 overflow-hidden rounded-xl border border-white/[0.07] bg-black/25">
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-slate-400">
          {state.status === "running" ? (
            <Loader2 className="size-3 animate-spin text-amber-300" />
          ) : (
            <Wrench className="size-3" />
          )}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-300">
          {part.tool}
        </span>
        {state.title && (
          <span className="hidden max-w-[40%] truncate text-[10px] text-slate-500 sm:inline">
            {state.title}
          </span>
        )}
        <Badge tone={toolStatusTone(state.status)}>{toolStatusLabel(state.status)}</Badge>
      </div>

      {inputs.length > 0 && (
        <div className="space-y-1 border-t border-white/[0.05] px-2.5 py-1.5">
          {inputs.map((row) => (
            <div key={row.label} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 rounded bg-white/[0.04] px-1 py-0.5 text-[9px] text-slate-500">
                {row.label}
              </span>
              <pre
                dir="ltr"
                className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all text-left font-mono text-[11px] leading-5 text-slate-300"
              >
                {row.value}
              </pre>
              {row.label === "الأمر" && (
                <button
                  type="button"
                  onClick={onCopy}
                  className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-white/[0.06] hover:text-slate-200"
                  aria-label="نسخ الأمر"
                >
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 border-t border-rose-400/10 bg-rose-500/[0.06] px-2.5 py-1.5 text-[11px] text-rose-300">
          <AlertCircle className="mt-0.5 size-3 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {output && (
        <details className="group border-t border-white/[0.05]">
          <summary className="flex cursor-pointer list-none items-center gap-1 px-2.5 py-1.5 text-[10px] text-slate-500 transition hover:text-slate-300">
            <ChevronDown className="size-3 transition group-open:rotate-180" />
            عرض الناتج
          </summary>
          <pre
            dir="ltr"
            className="max-h-44 overflow-auto whitespace-pre-wrap break-all border-t border-white/[0.05] bg-black/30 p-2.5 text-left font-mono text-[10.5px] leading-5 text-slate-400"
          >
            {output}
          </pre>
        </details>
      )}
    </div>
  );
}

function ReasoningCard({ part }: { part: ReasoningPart }) {
  if (!part.text.trim()) return null;
  return (
    <details className="group my-1.5 rounded-xl border border-violet-400/10 bg-violet-500/[0.04]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[10.5px] text-violet-300/80 transition hover:text-violet-200">
        <Sparkles className="size-3" />
        التفكير
        <ChevronDown className="ms-auto size-3 transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-violet-400/10 px-2.5 py-2">
        <Markdown>{part.text}</Markdown>
      </div>
    </details>
  );
}

function ErrorCard({ error }: { error: MessageError }) {
  const raw = error.data?.message;
  const message =
    typeof raw === "string" && raw.trim() ? raw : "حدث خطأ أثناء توليد الرد";
  const networkHint = /ECONNRESET|ENOTFOUND|fetch failed|network/i.test(message);
  return (
    <div className="my-1.5 rounded-xl border border-rose-400/20 bg-rose-500/[0.07] p-2.5">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-rose-400" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-rose-200">
            {error.name === "ProviderAuthError" ? "فشل مصادقة المزود" : "تعذر إكمال الطلب"}
          </p>
          <p dir="ltr" className="mt-0.5 break-words text-left font-mono text-[10.5px] leading-5 text-rose-200/80">
            {message}
          </p>
          <p className="mt-1.5 text-[10.5px] leading-5 text-rose-200/60">
            {networkHint
              ? "تعذر الوصول إلى مزود النموذج من هذه البيئة. جرّب مزوداً آخر أو تحقق من اتصال الشبكة / صلاحية المفتاح."
              : "جرّب نموذجاً آخر من زر النموذج، أو تحقق من إعدادات المزود (API key / رصيد الحساب)."}
          </p>
        </div>
      </div>
    </div>
  );
}

function PartView({ part }: { part: Part }) {
  switch (part.type) {
    case "text":
      if (!part.text.trim()) return null;
      return (
        <div className="py-0.5">
          <Markdown>{part.text}</Markdown>
        </div>
      );
    case "reasoning":
      return <ReasoningCard part={part} />;
    case "tool":
      return <ToolCard part={part} />;
    case "patch":
      return (
        <div className="my-1.5 flex items-start gap-2 rounded-xl border border-cyan-400/10 bg-cyan-500/[0.04] px-2.5 py-1.5">
          <GitBranch className="mt-0.5 size-3 shrink-0 text-cyan-300" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium text-cyan-200">تعديلات على الملفات</p>
            <p dir="ltr" className="truncate text-left font-mono text-[10px] text-slate-400">
              {part.files.join(" · ")}
            </p>
          </div>
        </div>
      );
    case "agent":
      return (
        <div className="my-1 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-slate-400">
          <Layers className="size-3" />
          وكيل: {part.name}
        </div>
      );
    case "retry":
      return (
        <div className="my-1 flex items-start gap-1.5 rounded-lg border border-amber-400/15 bg-amber-500/[0.05] px-2 py-1 text-[10.5px] text-amber-200/80">
          <RotateCw className="mt-0.5 size-3 shrink-0" />
          إعادة المحاولة #{part.attempt}
          {part.error?.data?.message ? ` — ${part.error.data.message}` : ""}
        </div>
      );
    case "compaction":
      return (
        <div className="my-1 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10.5px] text-slate-400">
          <Layers className="size-3" />
          {part.auto ? "تم ضغط السياق تلقائياً" : "تم ضغط السياق"}
        </div>
      );
    case "file":
      return (
        <div className="my-1 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10.5px] text-slate-300">
          <FileText className="size-3 shrink-0 text-slate-500" />
          <span className="truncate">{part.filename || "ملف مرفق"}</span>
          <Paperclip className="size-2.5 shrink-0 text-slate-600" />
        </div>
      );
    case "step-start":
    case "step-finish":
    case "snapshot":
      return null;
    default:
      return null;
  }
}

export function MessageItem({
  message,
  onCopy,
}: {
  message: Message;
  onCopy: (text: string) => void;
}) {
  const { info, parts } = message;

  if (info.role === "user") {
    const text = parts
      .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (!text) return null;
    return (
      <div className="flex justify-end">
        <div className="max-w-[86%] rounded-2xl rounded-bl-md bg-gradient-to-br from-[#d97757] to-[#a44d30] px-3.5 py-2.5 text-white shadow-lg shadow-orange-950/25">
          <p dir="auto" className="whitespace-pre-wrap break-words text-[13.5px] leading-7">
            {text}
          </p>
          <div className="mt-1 flex items-center justify-end gap-1 text-[9.5px] text-white/55">
            <span>{formatTime(info.time?.created)}</span>
            <CheckCheck className="size-3" />
          </div>
        </div>
      </div>
    );
  }

  const textParts = parts.filter(
    (part): part is Extract<Part, { type: "text" }> => part.type === "text",
  );
  const fullText = textParts.map((part) => part.text).join("\n\n").trim();
  const hasTool = parts.some((part) => part.type === "tool");
  const hasVisible = textParts.length > 0 || hasTool;

  return (
    <div className="flex justify-start gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-gradient-to-br from-cyan-500/15 to-violet-500/15 text-cyan-300">
        <Terminal className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-slate-500">
          <span className="font-semibold text-slate-300">OpenCode</span>
          {info.modelID && <Badge tone="slate">{info.modelID}</Badge>}
          {info.providerID && <span className="hidden sm:inline">· {info.providerID}</span>}
          <span>· {formatTime(info.time?.created)}</span>
          {info.time?.completed && info.time.created && (
            <span className="text-slate-600">
              · {formatDuration(info.time.completed - info.time.created)}
            </span>
          )}
          {fullText && (
            <IconButton
              label="نسخ الرد"
              onClick={() => onCopy(fullText)}
              className="ms-auto size-6 rounded-md"
            >
              <Copy className="size-3" />
            </IconButton>
          )}
        </div>

        <div className="rounded-2xl rounded-tr-md border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          {info.error && <ErrorCard error={info.error} />}
          {parts.map((part) => (
            <PartView key={part.id} part={part} />
          ))}
          {!hasVisible && !info.error && info.time?.completed && (
            <p className="py-0.5 text-[11.5px] italic text-slate-500">
              لم يُعِد النموذج أي نص.
            </p>
          )}
        </div>

        {(info.tokens?.input || info.tokens?.output) && (
          <div className="mt-1 flex flex-wrap items-center gap-2 px-0.5 text-[9.5px] text-slate-600">
            {info.tokens?.input ? <span>إدخال {info.tokens.input}</span> : null}
            {info.tokens?.output ? <span>إخراج {info.tokens.output}</span> : null}
            {info.cost ? <span>${info.cost.toFixed(4)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function TypingIndicator({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="flex justify-start gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-gradient-to-br from-cyan-500/15 to-violet-500/15 text-cyan-300">
        <Terminal className="size-3.5" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tr-md border border-white/[0.07] bg-white/[0.025] px-3 py-2">
        <span className="flex items-center gap-1">
          <span className="size-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.2s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.1s]" />
          <span className="size-1.5 animate-bounce rounded-full bg-cyan-400" />
        </span>
        <span className="text-[11px] text-slate-400">OpenCode يعمل…</span>
        {elapsedMs > 1500 && (
          <span className="font-mono text-[10px] text-slate-600">
            {formatDuration(elapsedMs)}
          </span>
        )}
        {elapsedMs > 60_000 && (
          <span className="text-[9.5px] text-amber-300/70">يستغرق وقتاً — يمكنك الإيقاف</span>
        )}
      </div>
    </div>
  );
}

export function AssistantEmptyHint() {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-amber-400/15 bg-amber-500/[0.04] px-2.5 py-1.5 text-[10.5px] text-amber-200/70">
      <AlertTriangle className="mt-0.5 size-3 shrink-0" />
      <span>إذا لم يظهر رد، تحقق من حالة الاتصال ثم أعد المحاولة.</span>
    </div>
  );
}

export function PermissionHint() {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-rose-400/15 bg-rose-500/[0.04] px-2.5 py-1.5 text-[10.5px] text-rose-200/70">
      <Ban className="mt-0.5 size-3 shrink-0" />
      <span>بعض الأدوات تحتاج موافقتك قبل التنفيذ.</span>
    </div>
  );
}
